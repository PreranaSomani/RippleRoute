import {createApp} from './app.mjs';
import {createDatabase} from './database.mjs';

// Vercel injects server environment variables. Never import server/index.mjs:
// it loads a local .env file and starts a listening server.
let database;
if(process.env.ENABLE_SAVED_HISTORY==='true'){
  try{database=createDatabase(process.env);}
  catch{console.error('[Database] Invalid configuration; Saved History remains disconnected.');}
}
export default createApp({
  apiKey:process.env.GEMINI_API_KEY,
  model:process.env.GEMINI_MODEL||undefined,
  voiceApiKey:process.env.ELEVENLABS_API_KEY,
  voiceId:process.env.ELEVENLABS_VOICE_ID,
  database,
  // Leave headroom below Vercel's 4.5 MB response-body limit.
  maxAudioBytes:4_000_000
});
