import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source.js';
import { User } from '../entities/User.js';

const ANON_LIMIT = 1;
const FREE_LIMIT = 10;

/**
 * Check whether the current user has remaining AI generations for today.
 * Handles both authenticated and anonymous users:
 *  - Authenticated users (req.userId set by auth middleware) → free=10/day, pro=unlimited
 *  - Anonymous users (x-anon-id header from localStorage) → 1/day
 *
 * Auto-provisions a User row if one doesn't exist yet.
 * Resets the daily counter at UTC midnight.
 * Sets X-AI-Generations-Remaining and X-AI-Generations-Limit headers.
 */
export async function checkAiRateLimit(req: Request, res: Response, next: NextFunction) {
  // Determine identity: prefer authenticated userId, fall back to anonymous header
  let userId = req.userId;
  let isAnonymous = false;

  if (!userId) {
    const anonId = req.headers['x-anon-id'] as string | undefined;
    if (anonId && /^[a-zA-Z0-9_-]{8,64}$/.test(anonId)) {
      userId = `anon:${anonId}`;
      isAnonymous = true;
    } else {
      return res.status(401).json({ error: 'Authentication required. Sign in or try again.' });
    }
  }

  const userRepo = AppDataSource.getRepository(User);
  let user = await userRepo.findOneBy({ id: userId });

  // Auto-provision if user doesn't exist
  if (!user) {
    user = userRepo.create({
      id: userId,
      email: isAnonymous ? 'anonymous' : (req.userEmail || 'unknown'),
      plan: isAnonymous ? 'anonymous' : 'free',
      maxCloudProjects: isAnonymous ? 0 : 1,
      maxAiGenerationsPerDay: isAnonymous ? ANON_LIMIT : FREE_LIMIT,
    });
    await userRepo.save(user);
  }

  // Unlimited plan — skip counting
  // In development mode, always skip rate limiting for convenience
  if (user.maxAiGenerationsPerDay < 0 || process.env.NODE_ENV === 'development') {
    res.setHeader('X-AI-Generations-Remaining', '-1');
    res.setHeader('X-AI-Generations-Limit', '-1');
    return next();
  }

  // Reset counter if a new UTC day has started
  const now = new Date();
  const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (!user.aiGenerationsResetAt || user.aiGenerationsResetAt < todayMidnight) {
    user.aiGenerationsToday = 0;
    user.aiGenerationsResetAt = now;
  }

  // Check limit
  if (user.aiGenerationsToday >= user.maxAiGenerationsPerDay) {
    res.setHeader('X-AI-Generations-Remaining', '0');
    res.setHeader('X-AI-Generations-Limit', String(user.maxAiGenerationsPerDay));
    return res.status(429).json({
      error: 'ai_rate_limit',
      message: isAnonymous
        ? `Free trial limit reached (${user.aiGenerationsToday}/${user.maxAiGenerationsPerDay}). Sign up for 10 free generations per day.`
        : `Daily AI generation limit reached (${user.aiGenerationsToday}/${user.maxAiGenerationsPerDay}). Upgrade to Pro for unlimited generations.`,
      used: user.aiGenerationsToday,
      limit: user.maxAiGenerationsPerDay,
    });
  }

  // Increment and save
  user.aiGenerationsToday += 1;
  await userRepo.save(user);

  const remaining = user.maxAiGenerationsPerDay - user.aiGenerationsToday;
  res.setHeader('X-AI-Generations-Remaining', String(remaining));
  res.setHeader('X-AI-Generations-Limit', String(user.maxAiGenerationsPerDay));

  // Attach quota info to request so the route handler can include it in the response body
  (req as any).aiQuota = {
    used: user.aiGenerationsToday,
    limit: user.maxAiGenerationsPerDay,
    remaining,
  };

  next();
}
