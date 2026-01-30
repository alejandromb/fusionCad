import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Project } from './entities/Project.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'fusion_cad',
  synchronize: true, // Auto-create tables (disable in production)
  logging: process.env.NODE_ENV === 'development',
  entities: [Project],
  migrations: [],
  subscribers: [],
});
