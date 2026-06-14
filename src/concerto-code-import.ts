import {
  checkForDupes,
  checkForDupesComposite,
  extForColumn,
  fileForEveryRow,
} from './common/sqlUtils';
import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getKeyFromFileName,
  getTestNodePortKeyFromFileName,
  makeTestNodePortKey,
} from './common/utils';

import * as fs from 'fs';

import { ExportRow } from './interface/exportrow.interface';
import { TestNodePortKey } from './interface/TestNodePort.interface';
import { TESTTABLE, VIEWTEMPLATETABLE } from './common/easi_const';
import { UpdateOrInsertViewTemplate } from './viewtemplate/viewtemplate-import';
import { UpdateOrInsertTest } from './test/test-import';

export async function dbImport(
  destConn: Connection,
  srcConn: Connection,
  table: string,
  keyColumn: string,
  compositeMode: boolean,
  columns: string[],
  inputRoot: string,
  dryRun: boolean,
) {
  let warnings = false;

  // 1) Check for duplicate rows in the database table this will throw an error if it fails
  if (compositeMode) {
    await checkForDupesComposite(destConn);
  } else {
    await checkForDupes(destConn, keyColumn ?? '', table);
  }
  console.log('Duplicate table key check passed.');

  // Execute the query to get the data
  let rows = [];
  if (compositeMode) {
    [rows] = await destConn.execute<ExportRow[]>(`
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

    [rows] = await destConn.execute<ExportRow[]>(`
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
    rowWarnings = await hasRowsTestNodePort(destConn, inputRoot);
  } else {
    rowWarnings = await hasRows(destConn, inputRoot, table, keyColumn ?? '');
  }

  if (!rowWarnings) {
    console.log('Column for every file check passed.');
  }
  /*   if (fileWarnings && !dryRun) {
    console.error('exiting with warnings');
    return;
  } */
  // 3) If not dry run, update the sql data for each changed file
  await updateRows(destConn, srcConn, inputRoot, table, keyColumn, compositeMode, dryRun);
  console.log('after update rows, going to close connection');

  await destConn.end();
  console.log('done ending connection');
}

async function updateRows(
  destConn: Connection,
  srcConn: Connection,
  inputRoot: string,
  table: string,
  keyColumn: string,
  compositeMode: boolean,
  dryRun: boolean,
) {
  const files = await fs.promises.readdir(inputRoot);
  for (const file of files) {
    if (table === VIEWTEMPLATETABLE) {
      console.log('on file: ', file);
      await UpdateOrInsertViewTemplate(destConn, srcConn, file, inputRoot, dryRun);
    } else if (table === TESTTABLE) {
      await UpdateOrInsertTest(destConn, srcConn, file, inputRoot, dryRun);
    }
  }
  console.log('hi from after for loop of files, exiting updateRows');
}

// Test if there are rows for every file
async function hasRows(
  conn: Connection,
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

async function hasRowsTestNodePort(conn: Connection, inputRoot: string): Promise<boolean> {
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
