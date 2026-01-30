import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { AppDataSource } from './data-source.js';
import { Project } from './entities/Project.js';

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

// ============ START SERVER ============

AppDataSource.initialize()
  .then(() => {
    console.log('Database connected successfully');

    app.listen(PORT, () => {
      console.log(`fusionCad API running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error('Database connection failed:', error);
    process.exit(1);
  });
