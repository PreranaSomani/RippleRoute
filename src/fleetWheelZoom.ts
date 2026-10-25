// Native non-passive listener: React's delegated wheel listener may be passive.
export function bindFleetWheelZoom(target:EventTarget,onZoom:(factor:number)=>void){
 const wheel=(event:Event)=>{
  const e=event as WheelEvent;
  if(!(e.altKey||e.ctrlKey)||!e.deltaY)return;
  e.preventDefault();
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?100:1);
  onZoom(Math.exp(-Math.max(-100,Math.min(100,delta))*.002));
 };
 target.addEventListener('wheel',wheel,{passive:false});
 return ()=>target.removeEventListener('wheel',wheel);
}
