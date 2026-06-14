import type { Connection, ResultSetHeader } from 'mysql2/promise';

import * as fs from 'fs';
import * as path from 'path';
import { TESTCODECOLUMN, TESTKEY, TESTTABLE } from '../common/easi_const';
import { getKeyFromFileName, normalizeText } from '../common/utils';
import { Test, TestRow } from './Test.interface';

export async function UpdateOrInsertTest(
  destConn: Connection,
  srcConn: Connection,
  file: string,
  inputRoot: string,
  dryRun: boolean,
) {
  const filePath = path.join(inputRoot, file);
  const fileContents = await fs.promises.readFile(filePath, 'utf8');
  const name = getKeyFromFileName(file);
  const column = TESTCODECOLUMN;
  const table = TESTTABLE;
  const [destRows] = await destConn.execute<TestRow[]>(
    `
      SELECT *
      FROM Test
      WHERE \`${TESTKEY}\` = ?
      `,
    [name],
  );
  const currentRow = destRows ? destRows[0] : null;
  if (!currentRow) {
    // Row for this file doesnt exist, insert
    if (!dryRun) {
      console.log(`No row for file ${file}, going to insert`);
      await insertTest(srcConn, destConn, file, fileContents);
    } else {
      console.log(`No row for file ${file}, would be inserting`);
    }
  } else {
    // Row exists, see if you need to update
    const currentValue = currentRow[column] as string | null;

    if (normalizeText(fileContents) !== normalizeText(currentValue)) {
      if (!dryRun) {
        console.log('updating db with', file);
        const keyValue = currentRow[TESTKEY] as string;
        await destConn.execute(
          `UPDATE \`${table}\`
          SET \`${column}\` = ?
          WHERE \`${TESTKEY}\` = ?`,
          [fileContents, keyValue],
        );
      } else {
        console.log('would be updating db with ', file);
      }
    }
  }
}

export async function insertTest(
  srcConn: Connection,
  destConn: Connection,
  file: string,
  fileContents: string,
) {
  const name = path.parse(file).name;
  const column = TESTCODECOLUMN;
  const keyColumn = TESTKEY;
  // I would be screwed if this used joined keys
  const [srcRows] = await srcConn.execute<TestRow[]>(
    `SELECT *
    FROM Test
    WHERE \`${keyColumn}\` = ?
    `,
    [name],
  );

  if (srcRows.length !== 0) {
    const insertRow: Test = {
      ...srcRows[0],
      [column]: fileContents,
    };
    delete insertRow.id;
    await insertTestRow(destConn, insertRow);
  } else {
    console.warn(`source row for ${file} not found`);
  }
}

async function insertTestRow(destConn: Connection, test: Test) {
  const values = [
    test.owner_id ?? null,
    test.name ?? '',
    test.description ?? '',
    test.visibility ?? 0,
    test.type ?? 0,
    test.code ?? '',
    test.slug ?? '',
    test.configOverride ?? null,
    test.protected,
    test.updatedBy ?? 'admin',
    test.accessibility ?? 0,
    test.groups ?? '',
    test.archived ?? 0,
    test.starterContent,
    test.tags ?? '',
    test.sourceWizard_id ?? null,
    test.baseTemplate_id ?? null,
    test.directLockBy_id ?? null,
  ];
  await destConn.execute<ResultSetHeader>(
    `INSERT INTO Test (
      owner_id,
      name,
      description,
      visibility,
      type,
      code,
      slug,
      configOverride,    
      protected,  
      updated,
      updatedBy,
      created,
      accessibility,
      \`groups\`,
      archived,
      starterContent,
      tags,
      sourceWizard_id,
      baseTemplate_id,
      directLockBy_id
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?,?,?,
      NOW(),
      ?,
      NOW(),
      ?, ?, ?, ?, ?, ?,?,?
    )
    `,
    values,
  );
}
