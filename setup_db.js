const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DIRECT_URL,
});

async function setup() {
  try {
    await client.connect();
    console.log('Connected to Supabase DB');

    const sql = `
      -- 1. Add Check-in column to bookings table
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_checked_in BOOLEAN DEFAULT FALSE;
      
      -- 2. Add Checked-in Time for audit
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE;
    `;

    await client.query(sql);
    console.log('Check-in columns added successfully! 🎫');
  } catch (err) {
    console.error('Error adding Check-in columns:', err);
  } finally {
    await client.end();
  }
}

setup();
