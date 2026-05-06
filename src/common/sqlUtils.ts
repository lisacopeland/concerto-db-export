import * as mysql from 'mysql2/promise';
import { RowDataPacket } from 'mysql2/promise';

// No need for a return - script will bomb
export async function checkForDupesComposite(conn: mysql.Connection) {
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

export async function checkForDupes(conn: mysql.Connection, keyColumn: string, table: string) {
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
