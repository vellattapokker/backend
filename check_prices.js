const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
  const { data: events, error } = await supabase.from('events').select('id, title, ticket_price');
  console.log('Events Data:', events);
  if (error) console.error('Error:', error);
}

check();
