import {readFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createApp} from './app.mjs';
import {DEFAULT_MODEL} from './advisor.mjs';
// Read this server-only file explicitly: never use VITE_* or a browser-visible key.
const envFile=new URL('./.env',import.meta.url);
const env=existsSync(envFile)?parseEnv(readFileSync(envFile,'utf8')):{};
const port=Number(env.PORT||3001);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT in server/.env');
const model=env.GEMINI_MODEL||DEFAULT_MODEL;
createApp({apiKey:env.GEMINI_API_KEY,model}).listen(port,'127.0.0.1',()=>{
  console.log(`RippleRoute API: http://127.0.0.1:${port} (${model})`);
  if(!env.GEMINI_API_KEY)console.log('Advisor unconfigured: add GEMINI_API_KEY to server/.env.');
});
