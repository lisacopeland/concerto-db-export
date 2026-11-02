import mysql, { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { v2 } from '@google-cloud/translate';
const { Translate } = v2;

// This app is meant to be run locally in either vscode or in a powershell terminal.
// To run this app you need: 1) Google account 2) Google project 3) Billing Account
// 4) Enable billing on the google project 5) gcloud cli to authenticate before running
// 6) Environment vars for accessing the source database (Typically the dev database)

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

const languages = {
  es: 'es',
  pt: 'pt',
  zh: 'zh-CN',
  fi: 'fi',
  tr: 'tr',
  zh_hk: 'zh-TW', // Approximation; review Hong Kong wording
};

const PROJECT_ID = 'translator-513301';

async function main(): Promise<void> {
  const translate = new Translate({
    projectId: PROJECT_ID,
  });
  // translateText(translate);
  // let destConn: Connection;
  let srcConn: Connection;
  /*   try {
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
  } */

  // Establish a connection to the source db in case there are additions
  try {
    srcConn = await mysql.createConnection({
      host: process.env.SRC_DB_HOST || '127.0.0.1',
      port: Number(process.env.SRC_DB_PORT || 3307),
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
    let totalCharacters = 0;
    let totalTranslations = 0;
    const [rows] = await srcConn.execute<EASITranslationDictionary[]>(
      `SELECT * FROM EASI_translation_dictionary`,
    );
    const batchSize = 50;
    for (const [column, target] of Object.entries(languages)) {
      // Only select rows missing this language
      const missing = rows.filter(
        (row) => shouldTranslate(row.en) && (row[column] == null || row[column].trim() === ''),
      );

      if (!missing.length) continue;

      console.log(`Translating ${missing.length} rows for ${column}`);

      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);
        const texts = batch.map((row) => row.en);

        const [result] = await translate.translate(texts, {
          from: 'en',
          to: target,
          format: 'text',
        });

        const translations = Array.isArray(result) ? result : [result];

        if (translations.length !== batch.length) {
          throw new Error(`Expected ${batch.length} translations, received ${translations.length}`);
        }

        for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          const translated = translations[j];

          if (!translated?.trim()) continue;

          const [updateResult] = await srcConn.execute<ResultSetHeader>(
            `UPDATE EASI_translation_dictionary
         SET \`${column}\` = ?
         WHERE entryKey = ?
           AND (\`${column}\` IS NULL OR TRIM(\`${column}\`) = '')`,
            [translated, row.entryKey],
          );

          if (updateResult.affectedRows > 0) {
            row[column] = translated;
          }
          console.log(
            `${column}: completed ${Math.min(i + batchSize, missing.length)} / ${missing.length}`,
          );
        }
      }
    }
    console.log('Translations needed:', totalTranslations);
    console.log('Characters to translate:', totalCharacters);
    console.log('Cost before free allowance: $', ((totalCharacters / 1_000_000) * 20).toFixed(4));
  } catch (e) {
    console.log('error caught ', e);
  } finally {
    await srcConn.end();
  }
}

const shouldTranslate = (text: string) => {
  if (typeof text !== 'string' || !text.trim()) {
    return false;
  }

  const value = text.trim();

  // Skip URLs
  if (/^https?:\/\//i.test(value)) {
    return false;
  }

  // Skip filenames / absolute paths
  if (value.startsWith('/')) {
    return false;
  }

  // Skip strings containing HTML tags
  if (/<\/?[a-z][^>]*>/i.test(value)) {
    return false;
  }

  return true;
};

async function translateText(translate: any) {
  // Translates the text into the target language. "text" can be a string for
  // translating a single piece of text, or an array of strings for translating
  // multiple texts.
  const text = 'I have two dogs';
  const target = 'es';
  let [translations] = await translate.translate(text, target);
  translations = Array.isArray(translations) ? translations : [translations];
  console.log('Translations:');
  translations.forEach((translation: any, i: number) => {
    console.log(`${text[i]} => (${target}) ${translation}`);
  });
}

main().catch((err) => {
  console.error('Failed to translate:', err);
  process.exit(1);
});
