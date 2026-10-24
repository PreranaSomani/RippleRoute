import {useState} from 'react';
import {Activity,Clock3,Compass,RotateCcw,Truck} from 'lucide-react';
import {connections,hubs} from './network';
import {DecisionReplay,DisruptionLab,NetworkUniverse,ShipmentJourneys} from './Views';
import {shipment,useSimulation} from './useSimulation';

type View='network'|'lab'|'journeys'|'replay';
const views=[{id:'network',label:'Network Universe',icon:Compass,kicker:'01 / THE CONNECTED WORLD',description:'Every connection holds a possibility.'},{id:'lab',label:'Disruption Lab',icon:Activity,kicker:'02 / EXPLORE THE WHAT-IF',description:'Change one connection. Discover a better way.'},{id:'journeys',label:'Shipment Journeys',icon:Truck,kicker:'03 / FOLLOW THE PLAN',description:'One shipment. Every step in view.'},{id:'replay',label:'Decision Replay',icon:Clock3,kicker:'04 / THE STORY SO FAR',description:'A living record of your network decisions.'}] as const;
function App(){
  const sim=useSimulation();
  const [view,setView]=useState<View>('network');
  const current=views.find(v=>v.id===view)!;
  return <div className={`app-shell phase-two view-${view}`}><div className="ocean-glow" aria-hidden="true"/>
    <header className="topbar"><div className="brand"><span className="brand-symbol"><Compass size={22}/></span><div><strong>ripple<span>route</span></strong><small>INTELLIGENT LOGISTICS</small></div></div><div className="top-center">EASTERN CORRIDOR <span className="brand-sparkle">✦</span> {shipment.id} / {shipment.cargo}</div><div className="header-right"><span className="live-pill"><span className="live-dot"/> SIMULATION</span><button className="icon-button" aria-label="Reset scenario" title="Reset scenario" onClick={sim.reset}><RotateCcw size={17}/></button></div></header>
    <main className="view-main"><header className="view-heading"><div><div className="eyebrow">{current.kicker}</div><h1>{current.label}<span> /</span></h1><p>{current.description}</p></div><div className="scene-stats" role="status"><span><b>{hubs.length}</b> hubs</span><span><b>{connections.length}</b> segments</span><span className={sim.closed.length?'attention':''}><b>{sim.closed.length}</b> disruptions</span></div></header>
      <div className="view-transition" key={view}>{view==='network'?<NetworkUniverse sim={sim}/>:view==='lab'?<DisruptionLab sim={sim}/>:view==='journeys'?<ShipmentJourneys sim={sim} onInspect={()=>setView('network')}/>:<DecisionReplay sim={sim}/>}</div>
    </main>
    <div className="dock-surface"><nav className="floating-dock" aria-label="Main navigation">{views.map(({id,label,icon:Icon})=><button key={id} className={view===id?'active':''} aria-current={view===id?'page':undefined} onClick={()=>{sim.pauseReplays();setView(id);}}><Icon size={18}/><span>{label}</span></button>)}</nav><span className="dock-caption">FICTIONAL NETWORK · LOCAL SIMULATION</span></div>
  </div>;
}
export default App;
