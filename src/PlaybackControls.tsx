import {Pause,RotateCcw,ArrowRight} from 'lucide-react';
import type {usePlayback} from './usePlayback';
type Playback=ReturnType<typeof usePlayback>;
export function PlaybackControls({playback,max,label,steps=false,disabled=false}:{playback:Playback;max:number;label:string;steps?:boolean;disabled?:boolean}){
  const complete=steps&&playback.position>=max;
  return <div className={`playback-controls playback-subtle ${steps?'story-progress':'journey-progress'}`} role="group" aria-label={`${label} controls`}>
    <span className="motion-caption"><i className={playback.running?'moving':''}/>{steps?complete?'Story complete':playback.running?'Story unfolding':'Story paused':playback.running?'Journey in motion':'Journey paused'}</span>
    {!steps&&<label className="playback-track"><span className="visually-hidden">{label} position</span><input type="range" aria-label={`${label} position`} min="0" max={max} step=".001" value={playback.position} disabled={disabled||max<=0} onChange={e=>playback.seek(Number(e.target.value))}/></label>}
    <output>{steps?`${Math.round(playback.position)+1} / ${max+1}`:`${Math.round(playback.position*100)}%`}</output>
    <button className="quiet-control" disabled={disabled||max<=0} aria-label={`${playback.running?'Pause':'Play'} ${label}`} title={playback.running?'Pause':'Resume'} onClick={playback.toggle}>{playback.running?<Pause size={15}/>:<ArrowRight size={15}/>}</button>
    <button className="quiet-control" disabled={disabled||max<=0} aria-label={steps?'Restart incident story':'Replay journey from start'} title="Replay from start" onClick={playback.replay}><RotateCcw size={15}/></button>
    {playback.reduced&&<small>Reduced motion · animation starts only when requested</small>}
  </div>;
}
