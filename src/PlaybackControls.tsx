import {Pause,Play,SkipBack,SkipForward} from 'lucide-react';
import type {usePlayback} from './usePlayback';
type Playback=ReturnType<typeof usePlayback>;
export function PlaybackControls({playback,max,label,steps=false,disabled=false}:{playback:Playback;max:number;label:string;steps?:boolean;disabled?:boolean}){
  return <div className="playback-controls" role="group" aria-label={`${label} controls`}>
    {steps&&<button className="icon-button" aria-label={`Previous ${label} event`} disabled={disabled||playback.position<=0} onClick={()=>playback.seek(playback.position-1)}><SkipBack size={18}/></button>}
    <button className="button primary" disabled={disabled||max<=0} aria-label={`${playback.running?'Pause':'Play'} ${label}`} onClick={playback.toggle}>{playback.running?<Pause size={16}/>:<Play size={16}/>} {playback.running?'Pause':'Play'}</button>
    {steps&&<button className="icon-button" aria-label={`Next ${label} event`} disabled={disabled||playback.position>=max} onClick={()=>playback.seek(playback.position+1)}><SkipForward size={18}/></button>}
    <label className="playback-track"><span>{label} position</span><input type="range" aria-label={`${label} position`} min="0" max={max} step={steps?1:.001} value={playback.position} disabled={disabled||max<=0} onChange={e=>playback.seek(Number(e.target.value))}/></label>
    <output>{steps?`${Math.round(playback.position)+1} / ${max+1}`:`${Math.round(playback.position*100)}%`}</output>
    {playback.reduced&&<small>Reduced motion · playback is opt-in</small>}
  </div>;
}
