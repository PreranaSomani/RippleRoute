import {AdvisorError,validateInput} from './contracts.mjs';
import {briefingText} from '../src/briefing.ts';
export const VOICE_MODEL='eleven_multilingual_v2';
const diagnostics={
  invalid_api_key:['VOICE_AUTH','ElevenLabs rejected the API key. Check that it is active and belongs to the intended workspace.'],
  missing_permissions:['VOICE_PERMISSION','The ElevenLabs key lacks permission. Enable Text to Speech access for this key in ElevenLabs.'],
  voice_not_found:['VOICE_ACCESS','ElevenLabs cannot access the configured voice. Copy its Voice ID from My Voices in the same workspace as the key.'],
  quota_exceeded:['VOICE_QUOTA','ElevenLabs credits or the API key credit limit are exhausted. Check subscription balance and key limits.'],
  model_not_found:['VOICE_MODEL','ElevenLabs rejected the configured model. Check model availability and voice compatibility.'],
  invalid_parameters:['VOICE_PARAMETERS','ElevenLabs rejected the synthesis parameters. Check model and voice compatibility.'],
  rate_limit_exceeded:['VOICE_RATE_LIMIT','ElevenLabs rate or concurrency limit reached. Retry after the current request finishes.'],
  unknown:['VOICE_UNAVAILABLE','ElevenLabs request failed. Check provider status and account access.']
};
// Never echo provider prose: it may include credentials, identifiers or request data.
// Only fixed, allowlisted categories and messages leave this function.
export async function voiceFailure(response){
  let detail;
  try{
    // Bound diagnostic reads; HTML/proxy errors and oversized bodies use HTTP fallback.
    const reader=response.body?.getReader();let size=0;const parts=[];
    if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();break;}parts.push(Buffer.from(value));}if(size<=16384)detail=JSON.parse(Buffer.concat(parts).toString('utf8'))?.detail;}finally{reader.releaseLock();}}
  }catch{/* No raw body or parse error is logged. */}
  const rawCode=detail?.code??detail?.status;
  const aliases={insufficient_permissions:'missing_permissions',authentication_error:'invalid_api_key',invalid_model_id:'model_not_found',model_not_supported:'model_not_found',concurrent_limit_exceeded:'rate_limit_exceeded',too_many_concurrent_requests:'rate_limit_exceeded',voice_not_available:'voice_not_found',insufficient_credits:'quota_exceeded'};
  const candidate=typeof rawCode==='string'?(aliases[rawCode]??rawCode):'unknown';
  let category=Object.hasOwn(diagnostics,candidate)?candidate:'unknown';
  if(category==='unknown'){
    // Some legacy responses place the permission diagnosis only in message text.
    const message=typeof detail?.message==='string'?detail.message:'';
    if(/missing.*permission|permission.*text.to.speech/i.test(message))category='missing_permissions';
    else category=({401:'invalid_api_key',402:'quota_exceeded',403:'missing_permissions',404:'voice_not_found',422:'invalid_parameters',429:'rate_limit_exceeded'})[response.status]??'unknown';
  }
  const [code,message]=diagnostics[category];
  return {category,code,message};
}
export function voiceConfigured(apiKey,voiceId){return [apiKey,voiceId].every(v=>typeof v==='string'&&!!v.trim()&&!v.trim().startsWith('replace_')&&!/\s/.test(v.trim())&&!/^https?:/i.test(v.trim()));}
export function createVoice({apiKey,voiceId,fetchAudio=fetch,maxAudioBytes=Infinity,logError=entry=>console.error('[ElevenLabs]',JSON.stringify(entry))}={}){
  apiKey=apiKey?.trim();voiceId=voiceId?.trim();
  return async(raw,{signal}={})=>{
    const data=validateInput(raw);
    const transcript=briefingText(data);
    if(!voiceConfigured(apiKey,voiceId))throw new AdvisorError(503,'VOICE_UNCONFIGURED','Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in server/.env and restart the backend.');
    try{
      const response=await fetchAudio(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,{
        method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json',Accept:'audio/mpeg'},
        body:JSON.stringify({text:transcript,model_id:VOICE_MODEL}),
        signal:signal?AbortSignal.any([signal,AbortSignal.timeout(40000)]):AbortSignal.timeout(40000)
      });
      if(!response.ok){
        const diagnostic=await voiceFailure(response);
        logError({httpStatus:response.status,category:diagnostic.category,message:diagnostic.message,model:VOICE_MODEL});
        throw new AdvisorError(diagnostic.category==='rate_limit_exceeded'||diagnostic.category==='quota_exceeded'?429:502,diagnostic.code,diagnostic.message);
      }
      if(!response.headers.get('content-type')?.toLowerCase().startsWith('audio/mpeg'))throw new AdvisorError(502,'INVALID_AUDIO','ElevenLabs returned an unexpected audio format.');
      const audio=Buffer.from(await response.arrayBuffer());
      if(audio.length>maxAudioBytes)throw new AdvisorError(502,'VOICE_TOO_LARGE','The generated briefing exceeds the hosting audio size limit.');
      if(!audio.length)throw new AdvisorError(502,'INVALID_AUDIO','ElevenLabs returned empty audio.');
      return {audio,transcript};
    }catch(error){
      if(error instanceof AdvisorError)throw error;
      if(error?.name==='AbortError'||error?.name==='TimeoutError'){logError({httpStatus:null,category:'timeout',message:'Voice request timed out or was cancelled.',model:VOICE_MODEL});throw new AdvisorError(504,'VOICE_TIMEOUT','Voice generation timed out or was cancelled. Please retry.');}
      logError({httpStatus:null,category:'network',message:'Could not reach ElevenLabs; check server DNS, TLS and outbound connectivity.',model:VOICE_MODEL});
      throw new AdvisorError(502,'VOICE_UNAVAILABLE','Cannot reach ElevenLabs. Check the server connection and retry.');
    }
  };
}
