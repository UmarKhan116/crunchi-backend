import { DataSource } from 'typeorm';
import { join } from 'path';

/**
 * DataSource for a THROWAWAY Postgres only (see docs/AGENT_RULES.md).
 * Reads TEST_DB_* explicitly and never loads .env, so it cannot reach the
 * database configured for the app. Refuses to run without TEST_DB_PORT.
 *
 *   docker run -d --rm --name be-m1-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=crunchy_test -p 55431:5432 postgres:16
 *   TEST_DB_PORT=55431 npm run test:db
 */
export function testDataSource(options: { synchronize?: boolean } = {}) {
  const port = process.env.TEST_DB_PORT;
  if (!port) {
    throw new Error('TEST_DB_PORT is not set; refusing to guess a database');
  }
  return new DataSource({
    type: 'postgres',
    host: process.env.TEST_DB_HOST || '127.0.0.1',
    port: Number(port),
    username: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'test',
    database: process.env.TEST_DB_NAME || 'crunchy_test',
    entities: [join(__dirname, '..', '..', 'src', 'entities', '*.entity.ts')],
    migrations: [join(__dirname, '..', '..', 'src', 'migrations', '*.ts')],
    synchronize: options.synchronize ?? false,
    logging: false,
    ssl: false,
  });
}

// For the TypeORM CLI: typeorm-ts-node-commonjs migration:run -d test/db/test-data-source.ts
export default process.env.TEST_DB_PORT ? testDataSource() : undefined;
