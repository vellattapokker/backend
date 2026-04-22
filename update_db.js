const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.japqdkuijxssdorwvzyu:0qWSCIevdCosCz9Y@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
});

const sql = `
-- 1. Add upi_id to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS upi_id TEXT;

-- 2. Add is_cancelled to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false;

-- 3. Add refund columns to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'none';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_tx_id TEXT;

-- 4. Add multi-scan columns to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_count INTEGER DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS food_redeemed_count INTEGER DEFAULT 0;

NOTIFY pgrst, 'reload schema';
`;

async function run() {
  try {
    await client.connect();
    await client.query(sql);
    console.log('Database schema successfully updated with cancellation and refund fields!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
