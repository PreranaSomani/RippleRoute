import express from 'express';
import {createIncidentStore} from './incidents.mjs';
import {createVoice} from './voice.mjs';
import {AdvisorError} from './contracts.mjs';
import {createAdvisor,DEFAULT_MODEL} from './advisor.mjs';
export function createApp({apiKey,model=DEFAULT_MODEL,generate,voiceApiKey,voiceId,fetchAudio,database}={}){
  const app=express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'24kb',strict:true}));
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.get('/api/health',(_req,res)=>res.json({status:'ok',advisorConfigured:Boolean(apiKey&&apiKey!=='replace_with_your_gemini_api_key'),model}));
  const analyze=createAdvisor({apiKey,model,generate});
  // One provider request at a time for this local-only server; no automatic paid retries.
  let busy=false;
  app.post('/api/ai/analyze',async(req,res,next)=>{
    if(busy)return res.status(429).json({error:{code:'ADVISOR_BUSY',message:'An analysis is already running. Retry after it finishes.'}});
    busy=true;
    const controller=new AbortController();
    const disconnect=()=>{if(!res.writableFinished)controller.abort();};
    res.on('close',disconnect);
    try{res.json(await analyze(req.body,{signal:controller.signal}));}catch(error){if(!res.destroyed)next(error);}finally{res.off('close',disconnect);busy=false;}
  });
  const briefing=createVoice({apiKey:voiceApiKey,voiceId,fetchAudio});
  let voiceBusy=false;
  app.post('/api/voice/briefing',async(req,res,next)=>{
    if(voiceBusy)return res.status(429).json({error:{code:'VOICE_BUSY',message:'A briefing is already generating. Retry after it finishes.'}});
    voiceBusy=true;
    const controller=new AbortController();
    const disconnect=()=>{if(!res.writableFinished)controller.abort();};
    res.on('close',disconnect);
    try{
      const {audio,transcript}=await briefing(req.body,{signal:controller.signal});
      if(!res.destroyed)res.set({'Content-Type':'audio/mpeg','X-Briefing-Transcript':encodeURIComponent(transcript),'X-Content-Type-Options':'nosniff'}).send(audio);
    }catch(error){if(!res.destroyed)next(error);}finally{res.off('close',disconnect);voiceBusy=false;}
  });
  const incidents=createIncidentStore(database);
  app.post('/api/incidents',async(req,res,next)=>{try{res.json({record:await incidents.save(req.body)});}catch(e){next(e);}});
  app.get('/api/incidents',async(req,res,next)=>{try{if(req.query.before!==undefined&&typeof req.query.before!=='string')throw new AdvisorError(400,'INVALID_CURSOR','Invalid history cursor.');res.json({records:await incidents.list(req.query.before)});}catch(e){next(e);}});
  app.get('/api/incidents/:id',async(req,res,next)=>{try{res.json({record:await incidents.get(req.params.id)});}catch(e){next(e);}});
  app.use('/api',(_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'API endpoint not found.'}}));
  app.use((error,_req,res,_next)=>{
    const known=error instanceof AdvisorError;
    const status=known?error.status:error.type==='entity.too.large'?413:error.type==='entity.parse.failed'?400:500;
    res.status(status).json({error:{code:known?error.code:'INVALID_REQUEST',message:known?error.message:status===413?'Request body is too large.':status===400?'Request body must be valid JSON.':'The advisor could not complete this request.'}});
  });
  return app;
}
