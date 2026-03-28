const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.japqdkuijxssdorwvzyu:0qWSCIevdCosCz9Y@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
});

async function run() {
  try {
    await client.connect();
    await client.query(`
      ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS lat FLOAT;
      ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS lng FLOAT;
      NOTIFY pgrst, 'reload schema';
    `);
    console.log('Programs table updated with lat/lng!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
