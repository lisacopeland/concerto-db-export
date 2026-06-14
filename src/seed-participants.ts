import mysql, { Connection, ResultSetHeader } from 'mysql2/promise';
import { EasiTest } from './EASI_test/EASI_test.interface';

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

const ADMIN_ID = 39;
const COUNT = Number(process.argv[2] ?? 1);

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(chars: string, length: number): string {
  return Array.from({ length }, () => chars[randomInt(0, chars.length - 1)]).join('');
}

function randomCustomId(): string {
  return randomString(CHARS, 6);
}

function randomInitials(): string {
  return randomString(LETTERS, randomInt(2, 3));
}

function randomEmail(): string {
  return `${randomString(CHARS, randomInt(7, 12))}@msn.com`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function randomDateBetween(start: Date, end: Date): string {
  const time = randomInt(start.getTime(), end.getTime());
  return formatDate(new Date(time));
}

function randomDateOfBirthForKid(): string {
  const today = new Date();

  const youngest = new Date(today);
  youngest.setFullYear(today.getFullYear() - 5);

  const oldest = new Date(today);
  oldest.setFullYear(today.getFullYear() - 17);

  return randomDateBetween(oldest, youngest);
}

function randomDateInLastMonth(): string {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setMonth(today.getMonth() - 1);

  return randomDateBetween(monthAgo, today);
}

async function createUniqueCustomId(conn: Connection): Promise<string> {
  console.log('creating customId');
  while (true) {
    const customId = randomCustomId();

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM EASI_participants WHERE customId = ?`,
      [customId],
    );

    if (rows[0].count === 0) {
      console.log('returning customId');
      return customId;
    }
  }
}

async function buildParticipant(conn: Connection): Promise<ParticipantInsert> {
  const customId = await createUniqueCustomId(conn);

  return {
    customId,
    dateOfBirth: randomDateOfBirthForKid(),
    countryOfResidence: 'United States of America (the)',
    admin_id: ADMIN_ID,
    gender: Math.random() < 0.5 ? 'Male' : 'Female',
    languageCode: 'en',
    diagnoses: null,
    diagnosesSelected: '[]',
    valid: 1,
    demographicsStatus: 0,
    demographicsToken: customId,
    initials: randomInitials(),
    email: randomEmail(),
    assessmentReason: null,
    clinicalAssessmentReferrer: Math.random() < 0.5 ? 'Parent' : null,
    researchProjectSelected: '[]',
    researchGroup: null,
    lastAssessmentDate: randomDateInLastMonth(),
    archived: 0,
    exportExclusion: 0,
  };
}

function safeTableName(code: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(code)) {
    throw new Error(`Invalid test code: ${code}`);
  }
  return `\`${code}_sessions\``;
}

async function createParticipantSessions(conn: Connection, participantId: number): Promise<void> {
  try {
    const [tests] = await conn.execute<EasiTest[]>(
      `SELECT * FROM EASI_tests WHERE autoNominate = 1`,
    );

    for (const test of tests) {
      const token = randomString(CHARS, 32);
      const tableName = safeTableName(test.code);
      await conn.execute(
        `
       INSERT INTO ${tableName} (participant_id, admin_id, timeCreated, token)
       VALUES (?, ?, NOW(), ?)
       `,
        [participantId, ADMIN_ID, token],
      );
    }
  } catch (err) {
    console.log('caught err = ', err);
  }
}

// tODO: Add ability to add sessions, random test scores, etc
async function main(): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DEST_DB_HOST || '127.0.0.1',
    port: Number(process.env.DEST_DB_PORT || 3306),
    user: process.env.DEST_DB_USER || 'root',
    password: process.env.DEST_DB_PASSWORD || '',
    database: process.env.DEST_DB_NAME,
    connectTimeout: 60000,
  });

  try {
    console.log(`Creating ${COUNT} test participants...`);

    for (let i = 0; i < COUNT; i++) {
      const p = await buildParticipant(conn);
      console.log('going to execute insert');
      const [result] = await conn.execute<ResultSetHeader>(
        `
        INSERT INTO EASI_participants (
          customId,
          dateOfBirth,
          countryOfResidence,
          admin_id,
          gender,
          languageCode,
          diagnoses,
          diagnosesSelected,
          valid,
          demographicsStatus,
          demographicsToken,
          initials,
          email,
          assessmentReason,
          clinicalAssessmentReferrer,
          researchProjectSelected,
          researchGroup,
          lastAssessmentDate,
          archived,
          exportExclusion
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?)
        `,
        [
          p.customId,
          p.dateOfBirth,
          p.countryOfResidence,
          p.admin_id,
          p.gender,
          p.languageCode,
          p.diagnoses,
          p.diagnosesSelected,
          p.valid,
          p.demographicsStatus,
          p.demographicsToken,
          p.initials,
          p.email,
          p.assessmentReason,
          p.clinicalAssessmentReferrer,
          p.researchProjectSelected,
          p.researchGroup,
          p.lastAssessmentDate,
          p.archived,
          p.exportExclusion,
        ],
      );
      console.log('done with insert');

      const participantId = result.insertId;
      await createParticipantSessions(conn, participantId);
      if ((i + 1) % 100 === 0) {
        console.log(`Inserted ${i + 1}/${COUNT}`);
      }
    }

    console.log('Done.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Failed to seed participants:', err);
  process.exit(1);
});
