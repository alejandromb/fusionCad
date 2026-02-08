import { execSync } from 'child_process';

/**
 * Global setup for Playwright E2E tests.
 * Creates the test database if it doesn't exist.
 */
export default async function globalSetup() {
  const dbName = 'fusion_cad_test';
  const containerName = 'fusion-cad-db';

  try {
    // Check if the test database already exists
    const result = execSync(
      `docker exec ${containerName} psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${dbName}'"`,
      { encoding: 'utf-8' }
    ).trim();

    if (result !== '1') {
      console.log(`Creating test database: ${dbName}`);
      execSync(
        `docker exec ${containerName} psql -U postgres -c "CREATE DATABASE ${dbName}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      console.log(`Test database "${dbName}" created successfully.`);
    } else {
      console.log(`Test database "${dbName}" already exists.`);
    }
  } catch (error) {
    console.error('Failed to create test database. Is Docker running?');
    console.error('Run "npm run db:up" first, then retry.');
    throw error;
  }
}
