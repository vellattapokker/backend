const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.japqdkuijxssdorwvzyu:0qWSCIevdCosCz9Y@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
});

async function run() {
  try {
    await client.connect();
    const res = await client.query(`
      UPDATE auth.users 
      SET encrypted_password = crypt($1, gen_salt('bf')) 
      WHERE email = $2
    `, ['Avs@1234', 'adithyanvs105@gmail.com']);
    
    if (res.rowCount > 0) {
      console.log('Successfully reset password!');
    } else {
      console.log('User not found. Could not reset password.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
