import * as mysql from 'mysql2/promise';
import { safeIdentifier, getArg } from './common/utils';
import { dbExport } from './concerto-code-export';
import { dbImport } from './concerto-code-import';

async function main() {
  const mode = process.argv[2]; // should be 'import' or 'export'
  if (mode !== 'export' && mode !== 'import') {
    throw new Error('1st arg must be export or import.');
  }

  const table = safeIdentifier(getArg('table'), 'table');
  if (!table) {
    throw new Error('You must provide the table value.');
  }

  // If table is Test or ViewTemplate, should be false, if TestNodePort then compositeMode should be true
  const compositeMode = getArg('compositemode') === 'true';

  const keyColumn = safeIdentifier(getArg('key', 'name'), 'key column');
  if (!compositeMode && !keyColumn) {
    throw new Error('You must provide the key column.');
  }

  const columns = (getArg('columns') ?? '')
    .split(',')
    .map((c) => safeIdentifier(c.trim(), 'column'))
    .filter((c): c is string => c !== null);
  if (!columns.length) {
    throw new Error('You must provide --columns html,css,js,code,value or similar.');
  }
  const outRoot = getArg('out') ?? '';
  const inputRoot = getArg('in') ?? '';
  if (mode === 'import' && inputRoot === '') {
    throw new Error('You must provide an input directory for import.');
  }

  if (mode === 'export' && outRoot === '') {
    throw new Error('You must provide an output directory for export.');
  }

  const dryRun = getArg('dry-run') === 'true'; // Ignored if this is export

  // Use env or defaults to create connection to db
  const conn: mysql.Connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    connectTimeout: 60000,
  });

  if (mode === 'import') {
    await dbImport(conn, table, keyColumn, compositeMode, columns, inputRoot, dryRun);
  } else {
    await dbExport(conn, table, keyColumn, compositeMode, columns, outRoot, dryRun);
  }
}

main().catch((err: unknown) => {
  console.error('fatal error', err);
  process.exit(1);
});
