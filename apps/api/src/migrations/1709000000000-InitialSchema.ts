import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration — creates projects, users, and symbols tables.
 * Matches the entity definitions created by synchronize:true during development.
 */
export class InitialSchema1709000000000 implements MigrationInterface {
  name = 'InitialSchema1709000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension for gen_random_uuid()
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Users table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL,
        "displayName" varchar(255),
        "plan" varchar(50) NOT NULL DEFAULT 'free',
        "maxCloudProjects" int NOT NULL DEFAULT 1,
        "aiGenerationsToday" int NOT NULL DEFAULT 0,
        "aiGenerationsResetAt" TIMESTAMP,
        "maxAiGenerationsPerDay" int NOT NULL DEFAULT 10,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // Projects table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "userId" varchar(255),
        "circuitData" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_projects" PRIMARY KEY ("id")
      )
    `);

    // Symbols table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "symbols" (
        "id" varchar(255) NOT NULL,
        "name" varchar(255) NOT NULL,
        "category" varchar(100) NOT NULL,
        "standard" varchar(100),
        "source" varchar(100),
        "tagPrefix" varchar(10),
        "definition" jsonb NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_symbols" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "symbols"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
