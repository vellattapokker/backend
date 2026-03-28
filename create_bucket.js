const { Client } = require('pg');

async function run() {
  const c = new Client({
    connectionString: 'postgresql://postgres.japqdkuijxssdorwvzyu:0qWSCIevdCosCz9Y@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await c.connect();
  console.log('Connected to database!');

  // 1. Create the bucket
  try {
    await c.query(`
      INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
      VALUES ('event-images', 'event-images', true, now(), now())
      ON CONFLICT (id) DO UPDATE SET public = true
    `);
    console.log('Bucket "event-images" created successfully!');
  } catch (e) {
    console.log('Bucket note:', e.message);
  }

  // 2. Create upload policy for authenticated users
  try {
    await c.query(`
      CREATE POLICY "allow_authenticated_uploads"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'event-images')
    `);
    console.log('INSERT policy created!');
  } catch (e) {
    console.log('INSERT policy:', e.message);
  }

  // 3. Create read policy for everyone
  try {
    await c.query(`
      CREATE POLICY "allow_public_read"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'event-images')
    `);
    console.log('SELECT policy created!');
  } catch (e) {
    console.log('SELECT policy:', e.message);
  }

  // 4. Create update policy
  try {
    await c.query(`
      CREATE POLICY "allow_authenticated_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'event-images')
      WITH CHECK (bucket_id = 'event-images')
    `);
    console.log('UPDATE policy created!');
  } catch (e) {
    console.log('UPDATE policy:', e.message);
  }

  // 5. Create delete policy
  try {
    await c.query(`
      CREATE POLICY "allow_authenticated_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'event-images')
    `);
    console.log('DELETE policy created!');
  } catch (e) {
    console.log('DELETE policy:', e.message);
  }

  // 6. Also add food columns while we're here
  try {
    await c.query(`ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_food_redeemed BOOLEAN DEFAULT FALSE`);
    await c.query(`ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS food_redeemed_at TIMESTAMP WITH TIME ZONE`);
    console.log('Food redemption columns added!');
  } catch (e) {
    console.log('Food columns:', e.message);
  }

  await c.end();
  console.log('Done! All storage setup complete.');
}

run().catch(e => console.error('Fatal:', e.message));
