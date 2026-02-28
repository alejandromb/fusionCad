import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Project } from './entities/Project.js';
import { Symbol } from './entities/Symbol.js';
import { User } from './entities/User.js';

const isProduction = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  // Support DATABASE_URL (Railway, Fly.io, Render) or individual env vars
  ...(process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5433'),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'fusion_cad',
      }),
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  synchronize: !isProduction, // NEVER synchronize in production — use migrations
  logging: process.env.NODE_ENV === 'development',
  entities: [Project, Symbol, User],
  migrations: ['dist/migrations/*.js'],
  subscribers: [],
});
