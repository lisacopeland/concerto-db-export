import { safeIdentifier, getArg, makeFileName, writeIfPresent } from './common/utils';

import * as fs from 'fs';
import * as path from 'path';
import { checkForDupes, checkForDupesComposite } from './common/sqlUtils';
import { ExportRow } from './interface/exportrow.interface';
import mysql from 'mysql2/promise';
import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export async function dbExport(
  conn: Connection,
  table: string,
  keyColumn: string | null,
  compositeMode: boolean,
  columns: string[],
  outRoot: string,
  dryRun: boolean,
) {
  // this will throw an error if it fails
  if (compositeMode) {
    await checkForDupesComposite(conn);
  } else {
    await checkForDupes(conn, keyColumn ?? '', table);
  }

  let rows;

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

  if (!dryRun) {
    fs.mkdirSync(outRoot, { recursive: true });

    for (const row of rows) {
      for (const column of columns) {
        const content = row[column] as string | null | undefined;

        const fileName = makeFileName(compositeMode, row, column ?? '', keyColumn ?? '');
        writeIfPresent(path.join(`${outRoot}//${fileName}`), content);
      }
    }
    console.log(`Exported ${rows.length} rows from ${table} to ${outRoot}`);
  } else {
    console.log(`Would have exported ${rows.length} rows from ${table} to ${outRoot}`);
  }

  await conn.end();
}
