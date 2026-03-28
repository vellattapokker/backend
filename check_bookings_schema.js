require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres.japqdkuijxssdorwvzyu:0qWSCIevdCosCz9Y@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
});

async function run() {
  let output = '';
  try {
    await client.connect();
    
    // Check if bookings table exists
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'bookings'
      );
    `);
    output += `Bookings table exists: ${checkTable.rows[0].exists}\n`;

    if (checkTable.rows[0].exists) {
      // Check columns
      const cols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'bookings'
      `);
      output += 'Columns:\n' + JSON.stringify(cols.rows, null, 2) + '\n';

      // Check foreign keys
      const fks = await client.query(`
        SELECT
            kcu.column_name, 
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='bookings';
      `);
      output += 'Foreign Keys:\n' + JSON.stringify(fks.rows, null, 2) + '\n';
    }

    fs.writeFileSync('schema_output.txt', output);
    console.log('Results written to schema_output.txt');

  } catch (err) {
    console.error('Error:', err);
    fs.writeFileSync('schema_output.txt', 'Error: ' + err.message);
  } finally {
    await client.end();
  }
}

run();
