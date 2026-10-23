/* Prints the SQL TypeORM would generate to sync entities -> throwaway DB. */
import { testDataSource } from './test-data-source';

(async () => {
  const ds = testDataSource();
  await ds.initialize();
  const log = await ds.driver.createSchemaBuilder().log();
  for (const q of log.upQueries) console.log(q.query + ';');
  if (!log.upQueries.length) console.log('-- no schema drift');
  await ds.destroy();
})();
