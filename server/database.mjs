import pg from 'pg';
import {readFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
export function databaseEnv(){const file=new URL('./.env',import.meta.url);return existsSync(file)?parseEnv(readFileSync(file,'utf8')):{};}
export function databaseConfig(value,caFile){
  if(!value||value.startsWith('replace_'))return null;
  try{
    const url=new URL(value);
    if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password)throw new Error();
    // pg connection-string SSL options otherwise override the explicit TLS policy.
    for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
    return {connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(caFile?{ca:readFileSync(caFile,'utf8')}:{})},max:4,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:15000,query_timeout:18000,application_name:'rippleroute'};
  }catch{throw new Error('Database configuration is invalid. Check server/.env and any DATABASE_CA_FILE path.');}
}
export function createDatabase(env){const config=databaseConfig(env.DATABASE_URL,env.DATABASE_CA_FILE);if(!config)return null;const pool=new pg.Pool(config);pool.on('error',()=>console.error('[Database] Idle connection failed; check service availability and TLS configuration.'));return pool;}

export function databaseFailure(error){
  if(['SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(error?.code))return 'Database TLS trust failed. Set DATABASE_CA_FILE to a CA chain obtained from a trusted source; certificate verification remains enabled.';
  if(['CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'].includes(error?.code))return 'Database TLS certificate is expired or does not match the configured hostname.';
  if(['ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET'].includes(error?.code))return 'Database connection failed. Check service availability, hostname, port and network access.';
  if(error?.code==='28P01')return 'Database authentication failed. Check the server-only DATABASE_URL credentials.';
  if(error?.code==='42501')return 'Database permissions are insufficient for the requested schema or TimescaleDB operation.';
  if(error?.code==='42P01')return 'Database schema is missing. Run npm run db:migrate.';
  return 'Database operation failed. Check server/.env, TLS trust, connectivity and migration status.';
}
