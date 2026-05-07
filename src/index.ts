import * as mysql from 'mysql2/promise';
import { safeIdentifier, getArg } from './common/utils';
import { dbExport } from './concerto-code-export';
import { dbImport } from './concerto-code-import';

async function main() {
  const mode = process.argv[2]; // should be 'import' or 'export'
  if (mode !== 'export' && mode !== 'import') {
    showParams();
    throw new Error('1st arg must be export or import.');
  } else {
    console.log('Doing ', mode);
  }

  const table = safeIdentifier(getArg('table'), 'table');
  if (!table) {
    showParams();
    throw new Error('You must provide the table value.');
  } else {
    console.log('Table name ', table);
  }

  // If table is Test or ViewTemplate, should be false, if TestNodePort then compositeMode should be true
  const compositeMode = getArg('compositemode') === 'true';

  const keyColumn = safeIdentifier(getArg('key', 'name'), 'key column');
  if (!compositeMode && !keyColumn) {
    showParams();
    throw new Error('You must provide the key column.');
  }

  if (compositeMode) {
    console.log('Composite key table');
  } else {
    console.log('Unique key for table: ', keyColumn);
  }

  const columns = (getArg('columns') ?? '')
    .split(',')
    .map((c) => safeIdentifier(c.trim(), 'column'))
    .filter((c): c is string => c !== null);
  if (!columns.length) {
    showParams();
    throw new Error('You must provide --columns html,css,js,code,value or similar.');
  }

  console.log('Columns to export to files: ', columns);

  const outRoot = getArg('out') ?? '';
  const inputRoot = getArg('in') ?? '';
  if (mode === 'import' && inputRoot === '') {
    showParams();
    throw new Error('You must provide an input directory for import.');
  } else {
    console.log('Getting files from ', inputRoot);
  }

  if (mode === 'export' && outRoot === '') {
    showParams();
    throw new Error('You must provide an output directory for export.');
  } else {
    console.log('Exporting files to ', outRoot);
  }

  const dryRun = getArg('dry-run') === 'true';
  if (dryRun) {
    console.log('Dry run is TRUE - data or files will not be modified');
  } else {
    console.log('Dry run is FALSE - data or files will modified');
  }

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

function showParams() {
  console.log('Import Export tool for database code app');
  console.log('Usage:');
  console.log('app import/export');
  console.log('Params:');
  console.log(
    '--table=tablename,  --compositemode=true/false, --dryrun=true/false --keycolumn=uniquekey',
  );
  console.log('--in=InputDir, --out=OutputDir, --columns=column names');
}
main().catch((err: unknown) => {
  console.error('fatal error', err);
  process.exit(1);
});
