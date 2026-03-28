require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[ERROR] Supabase URL or Anon Key missing from environment variables!');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = supabase;
