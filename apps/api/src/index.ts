import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { AppDataSource } from './data-source.js';
import { Project } from './entities/Project.js';
import { Symbol } from './entities/Symbol.js';
import { builtinSymbolsJson, convertSymbol } from '@fusion-cad/core-model';
import { aiGenerate } from './ai-generate.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for circuit data

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ PROJECT ROUTES ============

// List all projects
app.get('/api/projects', async (_req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const projects = await projectRepo.find({
      select: ['id', 'name', 'description', 'createdAt', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
    res.json(projects);
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Get single project with full circuit data
app.get('/api/projects/:id', async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Create new project
app.post('/api/projects', async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const { name, description, circuitData } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = projectRepo.create({
      name,
      description,
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
app.put('/api/projects/:id', async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
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

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const result = await projectRepo.delete(req.params.id);

    if (result.affected === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
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
app.put('/api/symbols/:id', async (req, res) => {
  try {
    const symbolRepo = AppDataSource.getRepository(Symbol);
    const definition = { ...req.body, id: req.params.id };

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
    res.json(definition);
  } catch (error) {
    console.error('Error saving symbol:', error);
    res.status(500).json({ error: 'Failed to save symbol' });
  }
});

// Delete symbol
app.delete('/api/symbols/:id', async (req, res) => {
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

// Force re-seed symbols from builtin JSON
app.post('/api/symbols/seed', async (_req, res) => {
  try {
    const result = await seedBuiltinSymbols();
    res.json(result);
  } catch (error) {
    console.error('Error seeding symbols:', error);
    res.status(500).json({ error: 'Failed to seed symbols' });
  }
});

/**
 * Seed builtin symbols from JSON into the database.
 * Only inserts symbols that don't already exist (by id).
 */
async function seedBuiltinSymbols(): Promise<{ seeded: number; skipped: number }> {
  const symbolRepo = AppDataSource.getRepository(Symbol);
  const jsonData = builtinSymbolsJson as any;
  let seeded = 0;
  let skipped = 0;

  for (const jsonSymbol of jsonData.symbols) {
    const existing = await symbolRepo.findOneBy({ id: jsonSymbol.id });
    if (existing) {
      skipped++;
      continue;
    }

    const definition = convertSymbol(jsonSymbol, jsonData.source) as any;

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

  return { seeded, skipped };
}

// ============ AI GENERATION ROUTES ============

// AI-powered circuit generation from natural language
app.post('/api/projects/:id/ai-generate', async (req, res) => {
  try {
    const projectRepo = AppDataSource.getRepository(Project);
    const project = await projectRepo.findOneBy({ id: req.params.id });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
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
    });
  } catch (error: any) {
    console.error('Error in AI generation:', error);
    res.status(500).json({ error: `AI generation failed: ${error.message}` });
  }
});

// ============ START SERVER ============

AppDataSource.initialize()
  .then(async () => {
    console.log('Database connected successfully');

    // Seed symbols if table is empty
    const symbolRepo = AppDataSource.getRepository(Symbol);
    const count = await symbolRepo.count();
    if (count === 0) {
      console.log('Seeding builtin symbols...');
      const result = await seedBuiltinSymbols();
      console.log(`Symbols seeded: ${result.seeded} new, ${result.skipped} skipped`);
    } else {
      console.log(`Symbols table has ${count} symbols`);
    }

    app.listen(PORT, () => {
      console.log(`fusionCad API running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error('Database connection failed:', error);
    process.exit(1);
  });
