import { checkForDupes, checkForDupesComposite } from './common/sqlUtils';
import {
  safeIdentifier,
  getArg,
  makeFileName,
  getKeyFromFileName,
  getTestNodePortKeyFromFileName,
  makeTestNodePortKey,
  normalizeText,
} from './common/utils';

import * as fs from 'fs';
import * as path from 'path';
import * as mysql from 'mysql2/promise';

import { ExportRow } from './common/exportrow.interface';
import { TestNodePortKey } from './common/testnodeportkey.interface';

export async function dbImport(
  conn: mysql.Connection,
  table: string,
  keyColumn: string | null,
  compositeMode: boolean,
  columns: string[],
  inputRoot: string,
  dryRun: boolean,
) {
  let warnings = false;

  // 1) Check for duplicate rows in the database table this will throw an error if it fails
  if (compositeMode) {
    await checkForDupesComposite(conn);
  } else {
    await checkForDupes(conn, keyColumn ?? '', table);
  }
  console.log('Duplicate table key check passed.');

  // Execute the query to get the data
  let rows = [];
  if (compositeMode) {
    [rows] = await conn.execute<ExportRow[]>(`
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

    [rows] = await conn.execute<ExportRow[]>(`
      SELECT ${selectedColumns}
      FROM \`${table}\`
      ORDER BY \`${keyColumn}\`
    `);
  }

  // Check for fileforeveryrow
  const fileWarnings = fileForEveryRow(rows, columns, keyColumn, compositeMode, inputRoot, table);

  if (!fileWarnings) {
    console.log('File for every column check passed.');
  } else {
    console.warn('File for every column to import not found');
  }

  let rowWarnings = false;
  if (compositeMode) {
    rowWarnings = await hasRowsTestNodePort(conn, inputRoot);
  } else {
    rowWarnings = await hasRows(conn, inputRoot, table, keyColumn ?? '');
  }

  if (!rowWarnings) {
    console.log('Column for every file check passed.');
  }
  if (fileWarnings || rowWarnings) {
    console.error('exiting with warnings');
    return;
  }
  // 3) If not dry run, update the sql data for each changed file
  for (const row of rows) {
    // get the filename
    const warnName = compositeMode
      ? `${row.flow_test_name}__${row.node_title}__${row.port_name}`
      : `${row[keyColumn!]}`;
    for (const column of columns) {
      if (row[column] != null && row[column] !== '') {
        const fileName = makeFileName(compositeMode, row, column ?? '', keyColumn ?? '');

        const filePath = path.join(inputRoot, fileName);

        if (!fs.existsSync(filePath)) {
          console.warn(`No ${table} file for ${column} column for ${warnName}`);
        } else {
          const fileContents = await fs.promises.readFile(filePath, 'utf8');
          const currentValue = row[column] as string | null;

          if (normalizeText(fileContents) !== normalizeText(currentValue)) {
            if (!dryRun) {
              console.log('updating ', warnName);
              if (!compositeMode) {
                const keyValue = row[keyColumn!] as string;
                await conn.execute(
                  `UPDATE \`${table}\`
                  SET \`${column}\` = ?
                  WHERE \`${keyColumn}\` = ?`,
                  [fileContents, keyValue],
                );
              } else {
                await conn.execute(
                  `UPDATE TestNodePort AS port
                  JOIN TestNode AS node ON node.id = port.node_id
                  JOIN Test AS flowTest ON flowTest.id = node.flowTest_id
                  SET port.\`value\` = ?
                  WHERE flowTest.name = ?
                  AND node.title = ?
                  AND port.name = ?
                `,
                  [fileContents, row.flow_test_name!, row.node_title!, row.port_name!],
                );
              }
            } else {
              console.log('DRY RUN is TRUE: would be updating ', warnName);
            }
          }
        }
      }
    }
  }

  await conn.end();
}

function fileForEveryRow(
  rows: ExportRow[],
  columns: string[],
  keyColumn: string | null,
  compositeMode: boolean,
  inputRoot: string,
  table: string,
): boolean {
  let warnings = false;
  // 2) First check that there is a file for every row
  for (const row of rows) {
    for (const column of columns) {
      if (row[column ?? ''] != null && row[column ?? ''] !== '') {
        const fileName = makeFileName(compositeMode ?? '', row, column ?? '', keyColumn ?? '');

        const filePath = path.join(inputRoot, fileName);
        if (!fs.existsSync(filePath)) {
          warnings = true;
          console.warn(`No ${table} file for ${column} column for ${row[keyColumn ?? '']}`);
        }
      }
    }
  }
  return warnings;
}

async function hasRows(
  conn: mysql.Connection,
  inputRoot: string,
  table: string,
  keyColumn: string,
): Promise<boolean> {
  let warnings = false;
  const files = await fs.promises.readdir(inputRoot);
  const fileNames = files.map((file) => getKeyFromFileName(file));
  const placeholders = fileNames.map(() => '?').join(', ');
  const [fileRows] = await conn.execute<ExportRow[]>(
    `SELECT \`${keyColumn}\`
   FROM \`${table}\`
   WHERE \`${keyColumn}\` IN (${placeholders})`,
    fileNames,
  );
  const existingKeys = new Set(fileRows.map((row) => row[keyColumn ?? '']));
  for (const file of files) {
    const name = getKeyFromFileName(file);
    if (!existingKeys.has(name)) {
      warnings = true;
      console.warn(`no row for file ${file}`);
    }
  }
  return warnings;
}

async function hasRowsTestNodePort(conn: mysql.Connection, inputRoot: string): Promise<boolean> {
  let warnings = false;
  const files = await fs.promises.readdir(inputRoot);
  const fileNames: TestNodePortKey[] = files.map((file) => getTestNodePortKeyFromFileName(file));
  const placeholders = fileNames.map(() => '(?, ?, ?)').join(', ');

  const params = fileNames.flatMap((key) => [key.flow_test_name, key.node_title, key.port_name]);
  const [fileRows] = await conn.execute<ExportRow[]>(
    `
  SELECT
    flowTest.name AS flow_test_name,
    node.title AS node_title,
    port.name AS port_name
  FROM TestNodePort port
  JOIN TestNode node ON node.id = port.node_id
  JOIN Test flowTest ON flowTest.id = node.flowTest_id
  WHERE (flowTest.name, node.title, port.name) IN (${placeholders})
  `,
    params,
  );
  const fileKeys = new Set(
    fileRows.map((x) => {
      return makeTestNodePortKey({
        flow_test_name: x.flow_test_name ?? '',
        node_title: x.node_title ?? '',
        port_name: x.port_name ?? '',
      });
    }),
  );

  for (const file of fileNames) {
    if (!fileKeys.has(makeTestNodePortKey(file))) {
      warnings = true;
      console.warn(`no row for file ${makeTestNodePortKey(file)}`);
    }
  }
  return warnings;
}
