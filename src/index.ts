import mysql, { Connection, ResultSetHeader } from 'mysql2/promise';
import { safeIdentifier, getArg } from './common/utils';
import { dbExport } from './concerto-code-export';
import { dbImport } from './concerto-code-import';

async function main() {
  let badParams = false;
  const mode = process.argv[2]; // should be 'import' or 'export'
  if (mode !== 'export' && mode !== 'import') {
    badParams = true;
    showParams();
  } else {
    console.log('Doing ', mode);
  }

  const table = safeIdentifier(getArg('table'), 'table');
  if (!table) {
    badParams = true;
    showParams();
  } else {
    console.log('Table name ', table);
  }

  // If table is Test or ViewTemplate, should be false, if TestNodePort then compositeMode should be true
  const compositeMode = getArg('compositemode') === 'true';

  const keyColumn = safeIdentifier(getArg('key', 'name'), 'key column');
  if (!compositeMode && !keyColumn) {
    badParams = true;
    showParams();
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
    badParams = true;
    showParams();
  }

  console.log('Columns to export to files: ', columns);

  const outRoot = getArg('out') ?? '';
  const inputRoot = getArg('in') ?? '';
  if (mode === 'import') {
    if (inputRoot === '') {
      badParams = true;
      showParams();
    } else {
      console.log('Getting files from ', inputRoot);
    }
  } else {
    if (outRoot === '') {
      badParams = true;
      showParams();
    } else {
      console.log('Exporting files to ', outRoot);
    }
  }

  const dryRun = getArg('dry-run') === 'true';
  if (dryRun) {
    console.log('Dry run is TRUE - data or files will not be modified');
  } else {
    console.log('Dry run is FALSE - data or files will modified');
  }

  if (badParams) {
    return;
  }

  // Use env or defaults to create connection to db
  let destConn: Connection;
  let srcConn: Connection;
  try {
    destConn = await mysql.createConnection({
      host: process.env.DEST_DB_HOST || '127.0.0.1',
      port: Number(process.env.DEST_DB_PORT || 3306),
      user: process.env.DEST_DB_USER || 'root',
      password: process.env.DEST_DB_PASSWORD || '',
      database: process.env.DEST_DB_NAME,
      connectTimeout: 60000,
    });
  } catch (err) {
    console.error('failed to connect', err);
    throw err;
  }

  if (mode === 'import') {
    // Establish a connection to the source db in case there are additions
    try {
      srcConn = await mysql.createConnection({
        host: process.env.SRC_DB_HOST || '127.0.0.1',
        port: Number(process.env.SRC_DB_PORT || 3308),
        user: process.env.SRC_DB_USER || 'root',
        password: process.env.SRC_DB_PASSWORD || '',
        database: process.env.SRC_DB_NAME,
        connectTimeout: 60000,
      });
    } catch (err) {
      console.error('failed to connect', err);
      throw err;
    }
    await dbImport(
      destConn,
      srcConn,
      table!,
      keyColumn ?? '',
      compositeMode,
      columns,
      inputRoot,
      dryRun,
    );
  } else {
    await dbExport(destConn, table!, keyColumn, compositeMode, columns, outRoot, dryRun);
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
