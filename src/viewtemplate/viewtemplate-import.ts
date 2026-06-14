import type { Connection, ResultSetHeader } from 'mysql2/promise';

import * as fs from 'fs';
import * as path from 'path';
import { VIEWTEMPLATEKEY, VIEWTEMPLATETABLE } from '../common/easi_const';
import { ViewTemplateRow, ViewTemplate } from './ViewTemplate.interface';
import { getKeyFromFileName, normalizeText } from '../common/utils';

export async function UpdateOrInsertViewTemplate(
  destConn: Connection,
  srcConn: Connection,
  file: string,
  inputRoot: string,
  dryRun: boolean,
) {
  const filePath = path.join(inputRoot, file);
  const fileContents = await fs.promises.readFile(filePath, 'utf8');
  const name = getKeyFromFileName(file);
  const column = path.extname(file).slice(1);
  const table = VIEWTEMPLATETABLE;
  const [destRows] = await destConn.execute<ViewTemplateRow[]>(
    `
      SELECT *
      FROM ViewTemplate
      WHERE \`${VIEWTEMPLATEKEY}\` = ?
      `,
    [name],
  );
  const currentRow = destRows ? destRows[0] : null;
  if (!currentRow) {
    // Row for this file doesnt exist, insert
    if (!dryRun) {
      console.log(`No row for file ${file}, going to insert`);
      await insertViewTemplate(srcConn, destConn, file, fileContents);
    } else {
      console.log(`No row for file ${file}, would be inserting`);
    }
  } else {
    // Row exists, see if you need to update
    console.log('row exists, going to compare');
    const currentValue = currentRow[column] as string | null;

    if (normalizeText(fileContents) !== normalizeText(currentValue)) {
      if (!dryRun) {
        console.log('updating db with', file);
        const keyValue = currentRow[VIEWTEMPLATEKEY] as string;
        const result = await destConn.execute(
          `UPDATE \`${table}\`
          SET \`${column}\` = ?
          WHERE \`${VIEWTEMPLATEKEY}\` = ?`,
          [fileContents, keyValue],
        );
        console.log('result from update ', result[0]);
      } else {
        console.log('would be updating db with ', file);
      }
    }
  }
}

export async function insertViewTemplate(
  srcConn: Connection,
  destConn: Connection,
  file: string,
  fileContents: string,
): Promise<string> {
  const name = path.parse(file).name;
  const column = path.extname(file).slice(1);
  const keyColumn = VIEWTEMPLATEKEY;
  const [srcRows] = await srcConn.execute<ViewTemplateRow[]>(
    `SELECT *
    FROM ViewTemplate
    WHERE \`${keyColumn}\` = ?
    `,
    [name],
  );

  if (srcRows.length !== 0) {
    const insertRow: ViewTemplate = {
      ...srcRows[0],
      [column]: fileContents,
    };
    delete insertRow.id;
    const result = await insertViewTemplateRow(destConn, insertRow);
    return result;
  } else {
    return `source row for ${file} not found`;
  }
}

async function insertViewTemplateRow(
  destConn: Connection,
  viewTemplate: ViewTemplate,
): Promise<string> {
  const values = [
    viewTemplate.owner_id ?? null,
    viewTemplate.name ?? '',
    viewTemplate.description ?? '',
    viewTemplate.head ?? '',
    viewTemplate.css ?? '',
    viewTemplate.js ?? '',
    viewTemplate.html ?? '',
    viewTemplate.updatedBy ?? 'admin',
    viewTemplate.accessibility ?? 0,
    viewTemplate.groups ?? '',
    viewTemplate.archived ?? 0,
    viewTemplate.starterContent ?? 0,
    viewTemplate.tags ?? '',
    viewTemplate.directLockBy_id ?? null,
  ];

  try {
    const result = await destConn.execute<ResultSetHeader>(
      `INSERT INTO ViewTemplate (
      owner_id,
      name,
      description,
      head,
      css,
      js,
      html,
      updated,
      updatedBy,
      created,
      accessibility,
      \`groups\`,
      archived,
      starterContent,
      tags,
      directLockBy_id
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      NOW(),
      ?,
      NOW(),
      ?, ?, ?, ?, ?, ?
    )
    `,
      values,
    );
    if (result[0].affectedRows !== 1) {
      return 'error inserting row';
    } else return 'success';
  } catch (err) {
    return 'error caught from inserting row';
  }
}
