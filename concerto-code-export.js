const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Get the arg named 'name' from the commandline
function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];

  return fallback;
}

// Ensure that a value contains only valid alpha chars
function safeIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

// Ensure that a foldername contains only valid chars
function safeName(name) {
  return String(name || 'unnamed')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

// Lookup the extension for the value in the named column
function extensionForColumn(column) {
  const map = {
    html: 'html',
    css: 'css',
    js: 'js',
    code: 'R',
    value: 'R',
  };

  return map[column] || 'txt';
}

// If the content is not empty or null, write to the filePath
function writeIfPresent(filePath, content) {
  if (content == null || content === '') return;
  fs.writeFileSync(filePath, String(content), 'utf8');
}

function makeFileName(mode, row, column, keyColumn) {
  let filename = '';
  if (mode == 'composite') {
    fileName = `${safeName(row['flow_test_name'])}__${safeName(row['node_title'])}__${safeName(row['port_name'])}.R`;
  } else {
    const ext = extensionForColumn(column);
    fileName = `${row[keyColumn]}.${ext}`;
  }
  return fileName;
}

// No need for a return - script will bomb
async function checkForDupesComposite(conn) {
  const [dupes] = await conn.execute(`SELECT
    flowTest.name,
    tn.title,
    tnp.name,
    COUNT(*) AS count
    FROM TestNodePort tnp
    JOIN TestNode tn ON tn.id = tnp.node_id
    JOIN Test flowTest ON flowTest.id = tn.flowTest_id
    WHERE tnp.name IN ('code', 'bgWorkers')
    GROUP BY flowTest.name, tn.title, tnp.name
    HAVING COUNT(*) > 1;
  `);
  if (dupes.length > 0) {
    console.error(`Duplicate testnodeport rows found`);
    for (const d of dupes) {
      console.error(`- ${d})`);
    }
    throw new Error(`Aborting export because TestNodePort columns are not unique.`);
  }
}

async function checkForDupes(conn, keyColumn, table) {
  const [dupes] = await conn.execute(`
    SELECT \`${keyColumn}\`, COUNT(*) AS count
    FROM \`${table}\`
    GROUP BY \`${keyColumn}\`
    HAVING COUNT(*) > 1
  `);

  if (dupes.length > 0) {
    console.error(`Duplicate ${table}.${keyColumn} values found:`);
    for (const d of dupes) {
      console.error(`- ${d[keyColumn]} (${d.count})`);
    }

    throw new Error(`Aborting export because ${table}.${keyColumn} is not unique.`);
  }
}

async function main() {
  // Table name is either ViewTemplate, Test, or TestNodePort
  const table = safeIdentifier(getArg('table'), 'table');
  const exportMode = safeIdentifier(getArg('mode'), 'mode');
  // for ViewTemplate this is "name",
  // for Test this is "name"
  // for TestNodePort this is composite
  const keyColumn = safeIdentifier(getArg('key', 'name'), 'key column');
  const columns = getArg('columns')
    .split(',')
    .map((c) => safeIdentifier(c.trim(), 'column'))
    .filter(Boolean);

  if (!columns.length) {
    throw new Error('You must provide --columns html,css,js,code,value or similar.');
  }
  if (!table) {
    throw new Error('You must provide the table value.');
  }

  if (exportMode != 'composite' && !keyColumn) {
    throw new Error('You must provide the key column.');
  }

  const outRoot = getArg('out', `./exports/${table}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    connectTimeout: 60000,
  });

  // Bomb if this fails
  if (exportMode === 'composite') {
    await checkForDupesComposite(conn);
  } else {
    await checkForDupes(conn, keyColumn, table);
  }

  let rows = [];
  if (exportMode == 'composite') {
    rows = await conn.execute(`
      SELECT
        flowTest.name AS flow_test_name,
        tn.title      AS node_title,
        tnp.name      AS port_name,
        tnp.value     AS value
      FROM TestNodePort tnp
      JOIN TestNode tn
        ON tn.id = tnp.node_id
      JOIN Test flowTest
        ON flowTest.id = tn.flowTest_id
      WHERE tnp.name IN ('code', 'bgWorkers')
        AND tnp.value IS NOT NULL
        AND tnp.value <> ''
      ORDER BY
        flowTest.name,
        tn.title,
        tnp.name;`);
  } else {
    const selectedColumns = [keyColumn, ...columns].map((c) => `\`${c}\``).join(', ');

    rows = await conn.execute(`
      SELECT ${selectedColumns}
      FROM \`${table}\`
      ORDER BY \`${keyColumn}\`
    `);
  }

  const dataRows = rows[0];
  fs.mkdirSync(outRoot, { recursive: true });

  for (const row of dataRows) {
    for (const column of columns) {
      const fileName = makeFileName(exportMode, row, column, keyColumn);
      writeIfPresent(path.join(`${outRoot}//${fileName}`), row[column]);
    }
  }

  await conn.end();

  console.log(`Exported ${dataRows.length} rows from ${table} to ${outRoot}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
