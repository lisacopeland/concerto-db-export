import mysql from 'mysql2/promise';
import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import path from 'path';

import * as fs from 'fs';
import { ExportRow } from '../interface/exportrow.interface';
import { makeFileName } from './utils';

// No need for a return - script will bomb
export async function checkForDupesComposite(conn: Connection) {
  const [dupes] = await conn.execute<RowDataPacket[]>(`SELECT
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

export async function checkForDupes(conn: Connection, keyColumn: string, table: string) {
  const [dupes] = await conn.execute<RowDataPacket[]>(`
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

// If a row has data, ensure that there is a file for it
export function fileForEveryRow(
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
      const value = row[column ?? ''];

      if (value != null && typeof value === 'string' && value.trim() !== '') {
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

export function extForColumn(table: string, ext: string) {
  if (table.toLowerCase() === 'viewtemplate') {
    return ext;
  } else if (table.toLowerCase() === 'test') {
    return 'code';
  } else {
    return 'value';
  }
}
