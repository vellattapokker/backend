require('dotenv').config();
const { Client } = require('pg');

async function fixDB() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
        await client.connect();
        await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending';`);
        await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE;`);
        await client.query(`UPDATE events SET payout_status = 'pending' WHERE payout_status IS NULL;`);
        console.log('Successfully added payout_status and settled_at columns to events table.');
    } catch (e) {
        console.error('Error fixing DB:', e);
    } finally {
        await client.end();
    }
}

fixDB();
