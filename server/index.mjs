import {createDatabase} from './database.mjs';
import {readFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createApp} from './app.mjs';
import {DEFAULT_MODEL} from './advisor.mjs';
import {voiceConfigured,VOICE_MODEL} from './voice.mjs';
// Read this server-only file explicitly: never use VITE_* or a browser-visible key.
const envFile=new URL('./.env',import.meta.url);
const env=existsSync(envFile)?parseEnv(readFileSync(envFile,'utf8')):{};
const port=Number(env.PORT||3001);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT in server/.env');
let database;
try{database=createDatabase(env);}catch{console.error('[Database] Invalid configuration; Saved History is disconnected. Check server/.env.');}
const model=env.GEMINI_MODEL||DEFAULT_MODEL;
const server=createApp({database,apiKey:env.GEMINI_API_KEY,model,voiceApiKey:env.ELEVENLABS_API_KEY,voiceId:env.ELEVENLABS_VOICE_ID}).listen(port,'127.0.0.1',()=>{
  console.log(`RippleRoute API: http://127.0.0.1:${port} (${model})`);
  console.log(`ElevenLabs configuration from server/.env: ${voiceConfigured(env.ELEVENLABS_API_KEY,env.ELEVENLABS_VOICE_ID)?'loaded (credentials not verified with provider)':'missing, placeholder or malformed'}; model ${VOICE_MODEL}.`);
  if(!env.GEMINI_API_KEY)console.log('Advisor unconfigured: add GEMINI_API_KEY to server/.env.');
});

for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(async()=>{await database?.end();});});
