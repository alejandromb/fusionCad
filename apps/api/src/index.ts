import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { AppDataSource } from './data-source.js';
import { Project } from './entities/Project.js';
import { User } from './entities/User.js';
import { Symbol } from './entities/Symbol.js';
import { builtinSymbolsJson, convertSymbol, generateLC50_24_Input, generateLC50_24_Output, lookupMotorStarter } from '@fusion-cad/core-model';
import { aiGenerate, generateMotorStarterPanel, type PanelOptions } from './ai-generate.js';
import { aiSymbolGenerate, aiSymbolImportAssist } from './ai-symbol-generate.js';
import { aiChat } from './ai-chat.js';
import { requireAuth } from './middleware/auth.js';
import { checkAiRateLimit } from './middleware/ai-rate-limit.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : undefined; // undefined = allow all origins (dev mode)

app.use(cors({
  origin: corsOrigins || true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for circuit data

// Health check — verifies DB connection
app.get('/health', async (_req, res) => {
  try {
    await AppDataSource.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ============ USER ROUTES ============

// Get current user profile + project count + plan info
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const projectRepo = AppDataSource.getRepository(Project);

    let user = await userRepo.findOneBy({ id: req.userId! });

    // Auto-provision user if not found (e.g. bypass mode)
    if (!user) {
      user = userRepo.create({
        id: req.userId!,
        email: req.userEmail || 'unknown',
        plan: 'free',
        maxCloudProjects: 1,
        maxAiGenerationsPerDay: 10,
      });
      await userRepo.save(user);
    }

    const projectCount = await projectRepo.count({ where: { userId: req.userId } });

    // Reset AI counter if new day
    const now = new Date();
    const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let aiUsedToday = user.aiGenerationsToday;
    if (!user.aiGenerationsResetAt || user.aiGenerationsResetAt < todayMidnight) {
      aiUsedToday = 0;
    }

    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      plan: user.plan,
      maxCloudProjects: user.maxCloudProjects,
      projectCount,
      aiQuota: {
        used: aiUsedToday,
        limit: user.maxAiGenerationsPerDay,
        remaining: user.maxAiGenerationsPerDay < 0 ? -1 : user.maxAiGenerationsPerDay - aiUsedToday,
      },
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// ============ PROJECT ROUTES ============

// List all projects (filtered by userId)
app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const projects = await projectRepo.find({
      select: ['id', 'name', 'description', 'createdAt', 'updatedAt'],
      where: { userId: req.userId },
      order: { updatedAt: 'DESC' },
    });
    res.json(projects);
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Get single project with full circuit data
app.get('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify ownership
    if (project.userId && project.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Create new project (with project limit enforcement)
app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const userRepo = AppDataSource.getRepository(User);
    const { name, description, circuitData } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    // Enforce project limit (skip in dev mode for testing convenience)
    const user = await userRepo.findOneBy({ id: req.userId! });
    if (process.env.NODE_ENV !== 'development' && user && user.maxCloudProjects > 0) {
      const currentCount = await projectRepo.count({ where: { userId: req.userId } });
      if (currentCount >= user.maxCloudProjects) {
        return res.status(403).json({
          error: 'project_limit_reached',
          message: `Free plan allows ${user.maxCloudProjects} cloud project(s). Upgrade for unlimited.`,
          currentCount,
          maxAllowed: user.maxCloudProjects,
        });
      }
    }

    const project = projectRepo.create({
      name,
      description,
      userId: req.userId,
      circuitData: circuitData || {
        devices: [],
        nets: [],
        parts: [],
        connections: [],
        positions: {},
      },
    });

    await projectRepo.save(project);
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project (full replace)
app.put('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify ownership
    if (project.userId && project.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, description, circuitData } = req.body;

    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    if (circuitData !== undefined) project.circuitData = circuitData;

    await projectRepo.save(project);
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Beacon save — used by beforeunload to flush unsaved changes
// sendBeacon always sends POST, so this mirrors the PUT logic
app.post('/api/projects/:id/save', requireAuth, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.userId && project.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { circuitData } = req.body;
    if (circuitData !== undefined) project.circuitData = circuitData;

    await projectRepo.save(project);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error in beacon save:', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// Delete project
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify ownership
    if (project.userId && project.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await projectRepo.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Claim an orphaned project (userId=null)
app.post('/api/projects/:id/claim', requireAuth, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.userId) {
      return res.status(400).json({ error: 'Project already claimed' });
    }

    project.userId = req.userId!;
    await projectRepo.save(project);
    res.json(project);
  } catch (error) {
    console.error('Error claiming project:', error);
    res.status(500).json({ error: 'Failed to claim project' });
  }
});

// ============ SYMBOL ROUTES ============

// List all symbols
app.get('/api/symbols', async (_req, res) => {
  try {
    const symbolRepo = AppDataSource.getRepository(Symbol);
    const symbols = await symbolRepo.find({ order: { category: 'ASC', name: 'ASC' } });
    res.json(symbols.map(s => s.definition));
  } catch (error) {
    console.error('Error listing symbols:', error);
    res.status(500).json({ error: 'Failed to list symbols' });
  }
});

// Get single symbol
app.get('/api/symbols/:id', async (req, res) => {
  try {
    const symbolRepo = AppDataSource.getRepository(Symbol);
    const symbol = await symbolRepo.findOneBy({ id: req.params.id });
    if (!symbol) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    res.json(symbol.definition);
  } catch (error) {
    console.error('Error getting symbol:', error);
    res.status(500).json({ error: 'Failed to get symbol' });
  }
});

// Create or update symbol
app.put('/api/symbols/:id', requireAuth, async (req, res) => {
  try {
    const symbolRepo = AppDataSource.getRepository(Symbol);
    const raw = { ...req.body, id: req.params.id };

    // Normalize to converted format (geometry wrapper + pin position wrapper).
    // The API is the single normalization point — DB always stores converted format.
    // This prevents the renderer crash when symbols lack geometry: {width, height}.
    let definition: Record<string, unknown>;
    if (raw.geometry && raw.geometry.width != null) {
      // Already in converted format
      definition = raw;
    } else if (raw.width != null && raw.height != null) {
      // Raw format from builtin-symbols.json or symbol editor "Save to Library"
      // Convert using the same converter that handles builtin JSON loading
      const converted = convertSymbol(raw as any);
      definition = converted as any;
    } else {
      // Unknown format — store as-is (shouldn't happen)
      definition = raw;
    }

    const symbol = symbolRepo.create({
      id: definition.id as string,
      name: definition.name as string,
      category: definition.category as string,
      standard: definition.standard as string | undefined,
      source: definition.source as string | undefined,
      tagPrefix: definition.tagPrefix as string | undefined,
      definition,
    });

    await symbolRepo.save(symbol);

    // Dev mode: persist edits to builtin-symbols.json so they survive restarts
    if (process.env.NODE_ENV === 'development') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const jsonPath = path.resolve(process.cwd(), 'packages/core-model/src/symbols/builtin-symbols.json');
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const idx = json.symbols.findIndex((s: any) => s.id === definition.id);
        if (idx >= 0) {
          // Convert back to flat JSON format for builtin-symbols.json
          const flat: Record<string, unknown> = {
            ...json.symbols[idx],
            ...definition,
            // Flatten geometry back to top-level width/height
            width: (definition.geometry as any)?.width ?? json.symbols[idx].width,
            height: (definition.geometry as any)?.height ?? json.symbols[idx].height,
          };
          // Flatten pin positions
          if ((definition as any).pins) {
            flat.pins = (definition as any).pins.map((p: any) => ({
              ...p,
              x: p.position?.x ?? p.x,
              y: p.position?.y ?? p.y,
            }));
          }
          delete (flat as any).geometry;
          json.symbols[idx] = flat;
          fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + '\n');
          console.log(`[dev] Persisted symbol "${definition.id}" to builtin-symbols.json`);
        }
      } catch (err) {
        // Non-fatal — DB save succeeded
        console.warn('[dev] Failed to persist to builtin-symbols.json:', err);
      }
    }

    res.json(definition);
  } catch (error) {
    console.error('Error saving symbol:', error);
    res.status(500).json({ error: 'Failed to save symbol' });
  }
});

// Delete symbol
app.delete('/api/symbols/:id', requireAuth, async (req, res) => {
  try {
    const symbolRepo = AppDataSource.getRepository(Symbol);
    const result = await symbolRepo.delete(req.params.id);
    if (result.affected === 0) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting symbol:', error);
    res.status(500).json({ error: 'Failed to delete symbol' });
  }
});

// Force re-seed symbols from builtin JSON (?force=true to update existing)
app.post('/api/symbols/seed', requireAuth, async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const result = await seedBuiltinSymbols(force);
    res.json(result);
  } catch (error) {
    console.error('Error seeding symbols:', error);
    res.status(500).json({ error: 'Failed to seed symbols' });
  }
});

/**
 * Seed builtin symbols from JSON into the database.
 * Default: only inserts symbols that don't already exist (by id).
 * With force=true: updates existing symbols with latest JSON definitions.
 */
async function seedBuiltinSymbols(force = false): Promise<{ seeded: number; updated: number; skipped: number }> {
  const symbolRepo = AppDataSource.getRepository(Symbol);
  const jsonData = builtinSymbolsJson as any;
  let seeded = 0;
  let updated = 0;
  let skipped = 0;

  for (const jsonSymbol of jsonData.symbols) {
    const definition = convertSymbol(jsonSymbol, jsonData.source) as any;
    const existing = await symbolRepo.findOneBy({ id: jsonSymbol.id });

    if (existing) {
      if (force) {
        // Only write to DB if the definition actually changed
        const existingJson = JSON.stringify(existing.definition);
        const newJson = JSON.stringify(definition);
        if (existingJson !== newJson || existing.name !== definition.name ||
            existing.category !== definition.category || existing.tagPrefix !== definition.tagPrefix) {
          existing.name = definition.name;
          existing.category = definition.category;
          existing.standard = definition.standard;
          existing.source = definition.source;
          existing.tagPrefix = definition.tagPrefix;
          existing.definition = definition;
          await symbolRepo.save(existing);
          updated++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    const symbol = symbolRepo.create({
      id: definition.id,
      name: definition.name,
      category: definition.category,
      standard: definition.standard,
      source: definition.source,
      tagPrefix: definition.tagPrefix,
      definition,
    });

    await symbolRepo.save(symbol);
    seeded++;
  }

  // Seed programmatically generated symbols (PLC modules, etc.)
  // These are regenerated if missing — protects against accidental deletion/overwrite.
  const generatedSymbols = [generateLC50_24_Input(), generateLC50_24_Output()];
  for (const definition of generatedSymbols) {
    const existing = await symbolRepo.findOneBy({ id: definition.id });
    if (existing) {
      // Only restore if the existing symbol was overwritten by an import
      // (detected by source changing from undefined/generated to 'imported')
      if (force || existing.source === 'imported') {
        existing.name = definition.name;
        existing.category = definition.category;
        existing.standard = definition.standard;
        existing.source = definition.source ?? 'generated';
        existing.tagPrefix = definition.tagPrefix;
        existing.definition = definition as any;
        await symbolRepo.save(existing);
        updated++;
      } else {
        skipped++;
      }
    } else {
      const symbol = symbolRepo.create({
        id: definition.id,
        name: definition.name,
        category: definition.category,
        standard: definition.standard,
        source: (definition as any).source ?? 'generated',
        tagPrefix: definition.tagPrefix,
        definition: definition as any,
      });
      await symbolRepo.save(symbol);
      seeded++;
    }
  }

  return { seeded, updated, skipped };
}

// ============ AI GENERATION ROUTES ============

// AI-powered circuit generation from natural language
app.post('/api/projects/:id/ai-generate', requireAuth, checkAiRateLimit, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify ownership
    if (project.userId && project.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'A "prompt" string is required' });
    }

    const result = await aiGenerate(prompt, (project.circuitData || {
      devices: [], nets: [], parts: [], connections: [], positions: {},
    }) as any);

    if (!result.success) {
      return res.status(400).json({ error: result.error, parsedOptions: result.parsedOptions });
    }

    // Save generated circuit data
    project.circuitData = result.circuitData as any;
    await projectRepo.save(project);

    res.json({
      success: true,
      summary: result.summary,
      parsedOptions: result.parsedOptions,
      aiQuota: (req as any).aiQuota || null,
    });
  } catch (error: any) {
    console.error('Error in AI generation:', error);
    res.status(500).json({ error: `AI generation failed: ${error.message}` });
  }
});

// ============ DETERMINISTIC MOTOR STARTER ============

/**
 * Deterministic motor starter generation — no AI parsing, no rate limit.
 * Takes a structured spec (from the Motor Starter Calculator hook) and generates
 * the full panel schematic + layout sheet with Schneider parts assigned.
 *
 * Used by the calculator → editor handoff so the user sees a complete, predictable
 * deliverable regardless of how the AI would have parsed a natural-language prompt.
 */
app.post('/api/projects/:id/generate-motor-starter', requireAuth, async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (project.userId && project.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const body = req.body as Partial<PanelOptions> | undefined;
    if (!body || typeof body.hp !== 'string' || typeof body.voltage !== 'string') {
      return res.status(400).json({ error: 'A body with { hp, voltage } (strings) is required' });
    }

    const options: PanelOptions = {
      hp: body.hp,
      voltage: body.voltage,
      phase: body.phase || 'three',
      controlVoltage: body.controlVoltage || '120VAC',
      country: body.country || 'USA',
      starterType: body.starterType || 'iec-open',
      hoaSwitch: body.hoaSwitch ?? true,
      pilotLight: body.pilotLight ?? true,
      plcRemote: body.plcRemote ?? false,
      eStop: body.eStop ?? true,
      // Always generate the layout sheet for the calculator handoff —
      // calculator users expect a complete deliverable.
      panelLayout: true,
    };

    const motorData = lookupMotorStarter({
      hp: options.hp,
      voltage: options.voltage,
      country: options.country,
      phase: options.phase,
      starterType: options.starterType as any,
    });

    const existingCircuit = (project.circuitData || {
      devices: [], nets: [], parts: [], connections: [], positions: {},
    }) as any;

    const result = generateMotorStarterPanel(existingCircuit, options, motorData || undefined);

    project.circuitData = result.circuit as any;
    await projectRepo.save(project);

    res.json({
      success: true,
      summary: result.summary,
      spec: options,
      partsAssigned: !!motorData,
    });
  } catch (error: any) {
    console.error('Error in deterministic motor starter generation:', error);
    res.status(500).json({ error: `Motor starter generation failed: ${error.message}` });
  }
});

// ============ AI SYMBOL GENERATION ============

// AI-powered symbol generation from natural language description
app.post('/api/symbols/ai-generate', requireAuth, checkAiRateLimit, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'A "description" string is required' });
    }

    const result = await aiSymbolGenerate(description);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error in AI symbol generation:', error);
    res.status(500).json({ error: `AI symbol generation failed: ${error.message}` });
  }
});

// AI-assisted symbol import — clean up raw SVG/DXF geometry with AI
app.post('/api/symbols/ai-import-assist', requireAuth, checkAiRateLimit, async (req, res) => {
  try {
    const { primitives, fileName, svgSource, usage } = req.body;
    if (!primitives || !Array.isArray(primitives)) {
      return res.status(400).json({ error: 'primitives array is required' });
    }
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'fileName string is required' });
    }

    const result = await aiSymbolImportAssist(primitives, fileName, svgSource, usage);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error in AI import assist:', error);
    res.status(500).json({ error: `AI import assist failed: ${error.message}` });
  }
});

// ============ AI CHAT ============

// AI assistant chat — context-aware conversation about the drawing
app.post('/api/ai-chat', requireAuth, checkAiRateLimit, async (req, res) => {
  try {
    const { message, projectId, circuitContext, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'A "message" string is required' });
    }

    const result = await aiChat(message, circuitContext || '', history || [], projectId);
    res.json(result);
  } catch (error: any) {
    console.error('Error in AI chat:', error);
    res.status(500).json({ error: `AI chat failed: ${error.message}` });
  }
});

// ============ START SERVER ============

AppDataSource.initialize()
  .then(async () => {
    console.log('Database connected successfully');

    // Seed builtin symbols: insert new only, never overwrite user edits
    console.log('Seeding builtin symbols...');
    const result = await seedBuiltinSymbols(false);
    console.log(`Symbols synced: ${result.seeded} new, ${result.updated} updated, ${result.skipped} unchanged`);

    app.listen(PORT, () => {
      console.log(`fusionCad API running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error('Database connection failed:', error);
    process.exit(1);
  });
