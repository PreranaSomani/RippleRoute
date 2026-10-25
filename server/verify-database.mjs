import {randomUUID} from 'node:crypto';
import {createDatabase,databaseEnv,databaseFailure} from './database.mjs';
import {createIncidentStore} from './incidents.mjs';
import {compareFleet,shipments} from '../src/fleet.ts';
let pool;
try{
  pool=createDatabase(databaseEnv());if(!pool)throw new Error();
  const tls=await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');if(tls.rows[0]?.ssl!==true)throw new Error();
  const hyper=await pool.query("SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema='rippleroute' AND hypertable_name='incident_events'");if(!hyper.rowCount)throw new Error();
  const store=createIncidentStore(pool),event={id:0,kind:'fleet',text:'Database verification using actual baseline fleet calculations',time:new Date().toISOString(),closed:[],route:null,origin:'mill',destination:'site',objective:'hours',context:'Fictional fleet',fleet:compareFleet(shipments,[])};
  const payload={idempotencyKey:randomUUID(),event};
  const saved=await store.save(payload),retried=await store.save(payload),loaded=await store.get(saved.id);
  if(saved.id!==retried.id||JSON.stringify(saved.event)!==JSON.stringify(loaded.event))throw new Error();
  const count=await pool.query('SELECT count(*)::int AS count FROM rippleroute.incident_events WHERE incident_id=$1',[saved.id]);if(count.rows[0].count!==1)throw new Error();
  console.log(`Verified TLS, TimescaleDB hypertable, committed incident insert, idempotent retry and retrieval. Saved baseline fleet record: ${saved.id}`);
}catch(error){console.error('Live database verification failed. '+databaseFailure(error));process.exitCode=1;}
finally{await pool?.end();}
