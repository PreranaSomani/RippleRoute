import {useEffect,useState} from 'react';
import {advance,clamp} from './replay';

export function usePlayback(max:number,signature:string,step:number,interval:number,loop=false,auto=false){
  const [position,setPosition]=useState(0);
  const [running,setRunning]=useState(auto);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{setReduced(media.matches);if(media.matches)setRunning(false);};
    update();media.addEventListener('change',update);
    return ()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{setPosition(0);setRunning(auto&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches);},[signature,auto]);
  useEffect(()=>{
    if(!running||max<=0)return;
    const timer=window.setInterval(()=>setPosition(p=>advance(p,max,step,loop)),interval);
    return ()=>window.clearInterval(timer);
  },[running,max,step,interval,loop]);
  useEffect(()=>{if(!loop&&position>=max)setRunning(false);},[position,max,loop]);
  function seek(value:number){setRunning(false);setPosition(clamp(value,max));}
  function toggle(){if(!running&&position>=max)setPosition(0);setRunning(r=>!r);}
  return {position:clamp(position,max),running:running&&(loop||position<max),reduced,seek,toggle,pause:()=>setRunning(false),resume:()=>setRunning(!window.matchMedia('(prefers-reduced-motion: reduce)').matches),restart:()=>{setPosition(0);setRunning(false);}};
}
