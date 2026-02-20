import type { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { AppDataSource } from '../data-source.js';
import { User } from '../entities/User.js';

// Extend Express Request with auth info
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

const BYPASS_AUTH = process.env.BYPASS_AUTH === 'true';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

/** Auth is fully configured only when both Cognito env vars are set */
const AUTH_ENABLED = !!(COGNITO_USER_POOL_ID && COGNITO_CLIENT_ID);

// Lazily initialized verifier
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!verifier && AUTH_ENABLED) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID!,
      tokenUse: 'access',
      clientId: COGNITO_CLIENT_ID!,
    });
  }
  return verifier;
}

/**
 * Extract and verify Bearer token from Authorization header.
 * Returns { sub, email } on success, null on failure.
 */
async function verifyToken(authHeader: string | undefined): Promise<{ sub: string; email?: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  const v = getVerifier();
  if (!v) return null;

  try {
    const payload = await v.verify(token);
    return { sub: payload.sub, email: (payload as any).email };
  } catch {
    return null;
  }
}

/**
 * Auto-provision a User row on first authenticated request.
 */
async function ensureUser(userId: string, email?: string): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const existing = await userRepo.findOneBy({ id: userId });
  if (!existing) {
    const user = userRepo.create({
      id: userId,
      email: email || 'unknown',
      plan: 'free',
      maxCloudProjects: 1,
      maxAiGenerationsPerDay: 10,
    });
    await userRepo.save(user);
  }
}

/**
 * Optional auth — extracts user from JWT if present, does NOT reject anonymous.
 * In BYPASS_AUTH mode or when auth is not configured, reads `x-test-user-id` header
 * or falls through with no userId.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  // Bypass mode: use test header or default to 'test-user'
  if (BYPASS_AUTH || !AUTH_ENABLED) {
    req.userId = (req.headers['x-test-user-id'] as string | undefined) || 'test-user';
    req.userEmail = 'test@example.com';
    return next();
  }

  // Real auth
  const result = await verifyToken(req.headers.authorization);
  if (result) {
    req.userId = result.sub;
    req.userEmail = result.email;
    await ensureUser(result.sub, result.email);
  }

  next();
}

/**
 * Require auth — rejects 401 if no valid JWT.
 * In BYPASS_AUTH mode, injects a test user from `x-test-user-id` header
 * (defaults to 'test-user').
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Bypass mode: always allow
  if (BYPASS_AUTH || !AUTH_ENABLED) {
    const testUserId = (req.headers['x-test-user-id'] as string | undefined) || 'test-user';
    req.userId = testUserId;
    req.userEmail = 'test@example.com';
    return next();
  }

  // Real auth
  const result = await verifyToken(req.headers.authorization);
  if (!result) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.userId = result.sub;
  req.userEmail = result.email;
  await ensureUser(result.sub, result.email);

  next();
}
