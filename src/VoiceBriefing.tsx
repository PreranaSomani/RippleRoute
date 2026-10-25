import {useEffect,useRef,useState} from 'react';
import {briefingText} from './briefing';
import type {advisorInput} from './advisor';
export function VoiceBriefing({input}:{input:ReturnType<typeof advisorInput>}){
  const signature=JSON.stringify(input);
  const [clip,setClip]=useState<{signature:string;url:string;transcript:string}|null>(null);
  const [loading,setLoading]=useState(false),[playing,setPlaying]=useState(false),[error,setError]=useState('');
  const audio=useRef<HTMLAudioElement|null>(null);
  const request=useRef<AbortController|null>(null);
  const objectUrl=useRef<string|null>(null);
  useEffect(()=>{
    request.current?.abort();request.current=null;
    audio.current?.pause();setLoading(false);setPlaying(false);setError('');setClip(null);
    if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;}
    return ()=>{request.current?.abort();request.current=null;audio.current?.pause();if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;}};
  },[signature]);
  const currentClip=clip?.signature===signature?clip:null;
  async function listen(){
    if(request.current)return;
    if(currentClip&&audio.current){
      if(!audio.current.paused){audio.current.pause();return;}
      try{setError('');await audio.current.play();}catch(e){if(audio.current?.paused&&!(e instanceof DOMException&&['NotAllowedError','AbortError'].includes(e.name)))setError('Playback could not start. Use the audio controls to retry.');}return;
    }
    const controller=new AbortController();request.current=controller;setLoading(true);setError('');
    const timer=window.setTimeout(()=>controller.abort(),45000);
    try{
      const response=await fetch('/api/voice/briefing',{method:'POST',headers:{'Content-Type':'application/json'},body:signature,signal:controller.signal});
      if(!response.ok){const data=await response.json();throw new Error(data.error?.message||'Voice generation failed. Please retry.');}
      if(!response.headers.get('content-type')?.startsWith('audio/mpeg'))throw new Error('The server did not return MP3 audio.');
      const transcript=decodeURIComponent(response.headers.get('X-Briefing-Transcript')??'');
      if(!transcript)throw new Error('The server did not return a briefing transcript.');
      const blob=await response.blob();if(!blob.size)throw new Error('The server returned empty audio.');
      if(controller.signal.aborted||request.current!==controller)return;
      const url=URL.createObjectURL(blob);objectUrl.current=url;
      setClip({signature,url,transcript});
      // Playback follows the explicit Listen request; blocked playback leaves native controls available.
      if(audio.current){audio.current.src=url;try{await audio.current.play();}catch(e){if(request.current===controller&&!controller.signal.aborted&&audio.current?.paused&&!(e instanceof DOMException&&['NotAllowedError','AbortError'].includes(e.name)))setError('Audio playback failed. Try the playback controls again.');}}
    }catch(e){if(request.current===controller)setError(controller.signal.aborted?'Briefing timed out. Please retry.':e instanceof Error?e.message:'Cannot reach the voice server. Start npm run server and retry.');}
    finally{window.clearTimeout(timer);if(request.current===controller){request.current=null;setLoading(false);}}
  }
  return <div className="voice-briefing" aria-label="ElevenLabs voice dispatcher" style={{borderTop:'1px solid #c4d6dc',paddingTop:12,marginTop:16}}>
    <button type="button" className="button subtle" disabled={loading} onClick={listen}>{loading?'Generating briefing…':playing?'Pause Briefing':currentClip?'Play Briefing':'Listen to Briefing'}</button>
    <small style={{marginLeft:10}}>ElevenLabs · generated only on request</small>
    {loading&&<p role="status">Generating speech from server-verified simulation facts…</p>}
    {error&&<p role="alert" className="advisor-error">{error}</p>}
    <audio ref={audio} controls={!!currentClip} hidden={!currentClip} src={currentClip?.url} preload="none" aria-label="Dispatch briefing playback" onPlay={()=>{setPlaying(true);setError('');}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>{setPlaying(false);setError('Audio playback failed. Try the playback controls again.');}}/>
    <p style={{fontSize:12,lineHeight:1.7}}><strong>Briefing transcript: </strong>{currentClip?.transcript??briefingText(input)}</p>
  </div>;
}
