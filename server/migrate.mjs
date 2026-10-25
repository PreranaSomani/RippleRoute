import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createDatabase,databaseEnv,databaseFailure} from './database.mjs';
export async function migrate(pool){
  const client=await pool.connect();
  try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(724188021)");await client.query(readFileSync(new URL('./migrations/001_incidents.sql',import.meta.url),'utf8'));await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let pool;try{pool=createDatabase(databaseEnv());if(!pool)throw new Error();await migrate(pool);console.log('RippleRoute incident migration complete, including TimescaleDB hypertable.');}
  catch(error){console.error('Migration failed. '+databaseFailure(error));process.exitCode=1;}
  finally{await pool?.end();}
}
