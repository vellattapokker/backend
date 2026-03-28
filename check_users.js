const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
  const { data: users, error } = await supabase.from('users').select('*');
  console.log('Public Users:', users);
  if (error) console.error('Error:', error);
}

check();
