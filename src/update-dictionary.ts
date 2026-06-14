import mysql, { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { EasiTest } from './EASI_test/EASI_test.interface';

export interface EASITranslationDictionary extends RowDataPacket {
  id: number;
  entryKey: string;
  en: string;
  es: string | null;
  pt: string | null;
  zh: string | null;
  fi: string | null;
  tr: string | null;
  zh_hk: string | null;
}

interface ParticipantInsert {
  customId: string;
  dateOfBirth: string;
  countryOfResidence: string;
  admin_id: number;
  gender: 'Male' | 'Female';
  languageCode: string;
  diagnoses: null;
  diagnosesSelected: string;
  valid: number;
  demographicsStatus: number;
  demographicsToken: string;
  initials: string;
  email: string;
  assessmentReason: null;
  clinicalAssessmentReferrer: 'Parent' | null;
  researchProjectSelected: string;
  researchGroup: null;
  lastAssessmentDate: string;
  archived: number;
  exportExclusion: number;
}

// tODO: Add ability to add sessions, random test scores, etc
async function main(): Promise<void> {
  let destConn: Connection;
  let srcConn: Connection;
  try {
    destConn = await mysql.createConnection({
      host: process.env.DEST_DB_HOST || '127.0.0.1',
      port: Number(process.env.DEST_DB_PORT || 3307),
      user: process.env.DEST_DB_USER || 'root',
      password: process.env.DEST_DB_PASSWORD || '',
      database: process.env.DEST_DB_NAME,
      connectTimeout: 60000,
    });
  } catch (err) {
    console.error('failed to connect', err);
    throw err;
  }

  // Establish a connection to the source db in case there are additions
  try {
    srcConn = await mysql.createConnection({
      host: process.env.SRC_DB_HOST || '127.0.0.1',
      port: Number(process.env.SRC_DB_PORT || 3306),
      user: process.env.SRC_DB_USER || 'root',
      password: process.env.SRC_DB_PASSWORD || '',
      database: process.env.SRC_DB_NAME,
      connectTimeout: 60000,
    });
  } catch (err) {
    console.error('failed to connect', err);
    throw err;
  }

  try {
    // get all entries from the source translation dictionary
    const [rows] = await srcConn.execute<EASITranslationDictionary[]>(
      `SELECT * FROM EASI_translation_dictionary`,
    );

    // loop thru the rows
    for (let i = 0; i < rows.length; i++) {
      const [destRows] = await destConn.execute<EASITranslationDictionary[]>(
        `SELECT * FROM EASI_translation_dictionary WHERE entryKey = ?`,
        [rows[i].entryKey],
      );
      if (destRows.length === 0) {
        // doesn't exist in dest table, create it
        const srcRow: any = { ...rows[i] };
        console.log('will be inserting row ', srcRow);
        await destConn.execute(
          `
        INSERT INTO EASI_translation_dictionary
        (entryKey, en, es, pt, zh, fi, tr, zh_hk)
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            srcRow.entryKey,
            srcRow.en,
            srcRow.es,
            srcRow.pt,
            srcRow.zh,
            srcRow.fi,
            srcRow.tr,
            srcRow.zh_hk,
          ],
        );
      }
    }

    console.log('Done.');
  } finally {
    await srcConn.end();
    await destConn.end();
  }
}

main().catch((err) => {
  console.error('Failed to seed participants:', err);
  process.exit(1);
});
