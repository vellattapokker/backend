const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.japqdkuijxssdorwvzyu:0qWSCIevdCosCz9Y@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
});

async function run() {
  try {
    await client.connect();
    await client.query(`
      ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticket_price NUMERIC DEFAULT 0;
      NOTIFY pgrst, 'reload schema';
    `);
    console.log('Events table upgraded with ticket_price column!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
