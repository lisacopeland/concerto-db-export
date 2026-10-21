import mysql, { Connection, ResultSetHeader } from 'mysql2/promise';
import { EasiTest } from './EASI_test/EASI_test.interface';
import { EasiSession } from './EASI_session/EASI_session.interface';
import { PAGE_SIZE } from './common/easi_const';

let tests: EasiTest[] = [];

function safeTableName(code: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(code)) {
    throw new Error(`Invalid test code: ${code}`);
  }
  return `\`${code}_sessions\``;
}

async function getAllTests(conn: Connection): Promise<void> {
  try {
    const [retValue] = await conn.execute<EasiTest[]>(
      `SELECT * FROM EASI_tests WHERE autoNominate = 1`,
    );
    tests = retValue;
  } catch (err) {
    console.error('Error fetching tests:', err);
    throw err;
  }
}

async function loopThruParticipants(conn: Connection): Promise<void> {
  let lastParticipantId = 0;
  let processed = 0;

  while (true) {
    const [participants] = await conn.execute(
      `
    SELECT id
    FROM EASI_participants
    WHERE id > ?
    ORDER BY id
    LIMIT ?
    `,
      [lastParticipantId, PAGE_SIZE],
    );

    const rows = participants as { id: number }[];

    if (!rows.length) {
      break;
    }

    for (const participant of rows) {
      try {
        await updateParticipantSessions(conn, participant.id);

        lastParticipantId = participant.id;
        processed++;
      } catch (err) {
        console.error(`FAILED participant ${participant.id}`, err);

        // Decide whether you want to stop here or continue.
        throw err;
      }
    }
  }
}

async function updateAllSessions(conn: Connection): Promise<void> {
  const BATCH_SIZE = 1000;

  for (const test of tests) {
    const tableName = safeTableName(test.code);

    console.log(`Processing ${tableName}`);

    // Get ALL sessions for this test, ordered so that each
    // participant's sessions are chronological.
    const [sessions] = await conn.execute<EasiSession[]>(`
      SELECT
        id,
        participant_id
      FROM ${tableName}
      ORDER BY participant_id ASC, timeCreated ASC, id ASC
    `);

    console.log(`Found ${sessions.length} sessions`);

    //
    // Calculate testIteration in Node.
    //
    let previousParticipantId: number | null = null;
    let iteration = 0;

    const updates: { id: number; testIteration: number }[] = [];

    for (const session of sessions) {
      if (session.participant_id !== previousParticipantId) {
        // New participant
        iteration = 0;
        previousParticipantId = session.participant_id;
      } else {
        // Another session for the same participant
        iteration++;
      }

      updates.push({
        id: session.id,
        testIteration: iteration,
      });
    }

    //
    // Bulk update in batches.
    //
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      const caseSql = batch.map(() => `WHEN ? THEN ?`).join(' ');

      const idPlaceholders = batch.map(() => '?').join(',');

      const params: any[] = [];

      // Parameters for CASE
      for (const row of batch) {
        params.push(row.id, row.testIteration);
      }

      // Parameters for WHERE IN
      for (const row of batch) {
        params.push(row.id);
      }

      await conn.execute(
        `
        UPDATE ${tableName}
        SET testIteration = CASE id
          ${caseSql}
        END
        WHERE id IN (${idPlaceholders})
        `,
        params,
      );

      console.log(
        `${tableName}: updated ${Math.min(i + BATCH_SIZE, updates.length)} of ${updates.length}`,
      );
    }

    console.log(`Finished ${tableName}`);
  }
}

async function updateParticipantSessions(conn: Connection, participantId: number): Promise<void> {
  try {
    for (const test of tests) {
      const tableName = safeTableName(test.code);
      const [sessions] = await conn.execute<EasiSession[]>(
        `
        SELECT id
        FROM ${tableName}
        WHERE participant_id = ?
        ORDER BY timeCreated ASC, id ASC
      `,
        [participantId],
      );

      let iteration = null;

      for (const session of sessions) {
        await conn.execute(
          `
          UPDATE ${tableName}
          SET testIteration = ?
          WHERE id = ?
        `,
          [iteration, session.id],
        );

        // iteration++;
      }
    }
  } catch (err) {
    console.log('caught err = ', err);
  }
}

async function main(): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DEST_DB_HOST || '127.0.0.1',
    port: Number(process.env.DEST_DB_PORT || 3305),
    user: process.env.DEST_DB_USER || 'root',
    password: process.env.DEST_DB_PASSWORD || '',
    database: process.env.DEST_DB_NAME,
    connectTimeout: 60000,
  });
  await getAllTests(conn);
  await updateAllSessions(conn);
  // await loopThruParticipants(conn);
  await conn.end();
}

main().catch((err) => {
  console.error('Failed to seed participants:', err);
  process.exit(1);
});
