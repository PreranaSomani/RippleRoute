import {useEffect,useRef,useState} from 'react';
import {canDisrupt,connections,fmt,hubs} from './network';
import {routePosition} from './replay';
import {connectedHubIds,defaultViewport,fitCamera,focusCamera,layoutPoints,overviewCamera,spatialPath,spatialPosition,spatialRadius,zoomCamera,type Camera,type SpatialViewport} from './spatialNetworkGeometry';
import type {Simulation} from './useSimulation';
function scenePoint(svg:SVGSVGElement,x:number,y:number){const matrix=svg.getScreenCTM();return matrix?new DOMPoint(x,y).matrixTransform(matrix.inverse()):{x,y};}
const roles={mill:'Production origin for the fictional steel dispatch.',port:'Transfer terminal joining the industrial corridor.',rail:'A junction connecting alternative directed freight paths.',warehouse:'A staging and distribution point in the shared network.',destination:'The destination facility for the simulated dispatch.'};
export function SpatialNetwork({sim}:{sim:Simulation}){
  const [focused,setFocused]=useState<string|null>(null),[camera,setCamera]=useState<Camera>(overviewCamera),[dragging,setDragging]=useState(false);
  const [viewport,setViewport]=useState<SpatialViewport>(defaultViewport);
  const canvas=useRef<SVGSVGElement|null>(null);
  const points=layoutPoints(viewport);
  const fitOverview=()=>fitCamera(hubs.map(h=>h.id),viewport,points);
  const isOverview=!focused&&Math.abs(camera.scale-fitOverview().scale)<.001&&Math.abs(camera.x-fitOverview().x)<.1&&Math.abs(camera.y-fitOverview().y)<.1;
  useEffect(()=>{
    if(!canvas.current||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;if(width>0&&height>0)setViewport(previous=>Math.abs(previous.width-width)<1&&Math.abs(previous.height-height)<1?previous:{width,height});});
    observer.observe(canvas.current);return ()=>observer.disconnect();
  },[]);
  const drag=useRef<{x:number;y:number;camera:Camera}|null>(null);
  const neighborhood=focused?connectedHubIds(focused):new Set(hubs.map(h=>h.id));
  const selected=hubs.find(h=>h.id===(focused?sim.selected:null));
  const safeRoute=sim.active&&!sim.active.ids.some(id=>sim.closed.includes(id))?sim.active:null;
  const routeKey=safeRoute?.edgeIds.join('|')??'none';
  const oldRoute=sim.previous?.[sim.objective];
  const marker=routePosition(safeRoute,sim.networkPlayback.position);
  const position=marker?spatialPosition(marker.edge.from,marker.edge.to,marker.t,points):null;
  const lastEvent=sim.history[0];
  const name=(id:string)=>hubs.find(h=>h.id===id)?.label??id;
  const incident=sim.previous?`${name(sim.previous.hubId)} ${sim.closed.includes(sim.previous.hubId)?'closed':'restored'}; ${!safeRoute?'no feasible route remains.':oldRoute?.edgeIds.join('|')===routeKey?'the selected route remains feasible.':oldRoute?'freight now follows the highlighted alternative.':'a feasible route is available again.'}`:null;
  useEffect(()=>{
    const next=focused?focusCamera(sim.selected,viewport,points):fitOverview();
    if(focused)setFocused(sim.selected);setCamera(next);
    const scroll=canvas.current?.parentElement;
    if(scroll&&scroll.clientWidth<viewport.width){
      const target=focused?points[sim.selected].x*next.scale+next.x:viewport.width/2;
      scroll.scrollLeft=Math.max(0,target-scroll.clientWidth/2);
    }
  },[focused,sim.selected,viewport.width,viewport.height]);
  function focus(id:string){sim.setSelected(id);setFocused(id);setCamera(focusCamera(id,viewport,points));}
  function overview(){setFocused(null);setCamera(fitOverview());}
  function pan(x:number,y:number){setCamera(c=>({...c,x:Math.max(-900,Math.min(900,c.x+x)),y:Math.max(-650,Math.min(650,c.y+y))}));}
  return <section className={`spatial-network ${focused?'is-focused':''} ${dragging?'is-dragging':''}`} aria-label="Network Universe spatial prototype">
    <header className="spatial-toolbar"><div><span className="spatial-eyebrow">EASTERN CORRIDOR / INTERACTIVE SIMULATION</span><h2>Explore the corridor.</h2></div><button className="spatial-back" onClick={overview} disabled={isOverview}>← Back to Network</button></header>
    <div className="spatial-controls"><div className="spatial-objectives" role="group" aria-label="Route objective"><button aria-pressed={sim.objective==='hours'} onClick={()=>sim.setObjective('hours')}>Fastest</button><button aria-pressed={sim.objective==='cost'} onClick={()=>sim.setObjective('cost')}>Lowest cost</button></div><label>Find a hub <select aria-label="Focus hub" value={focused??''} onChange={e=>e.target.value?focus(e.target.value):overview()}><option value="">Whole network</option>{hubs.map(h=><option value={h.id} key={h.id}>{h.label}{sim.closed.includes(h.id)?' · CLOSED':''}</option>)}</select></label><span className="spatial-scale">{isOverview?'Fit to window':`${Math.round(camera.scale*100)}% view`}</span></div>
    <div className="spatial-environment">
      <div className="spatial-scroll" role="region" tabIndex={0} aria-label="Network camera: drag to pan; arrow keys pan; plus and minus zoom; Escape returns to overview" onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Escape'){overview();e.preventDefault();}else if(e.key==='+'||e.key==='='){setCamera(c=>zoomCamera(c,1.15,viewport));e.preventDefault();}else if(e.key==='-'){setCamera(c=>zoomCamera(c,1/1.15,viewport));e.preventDefault();}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){pan(e.key==='ArrowLeft'?50:e.key==='ArrowRight'?-50:0,e.key==='ArrowUp'?50:e.key==='ArrowDown'?-50:0);e.preventDefault();}}}>
      <svg ref={canvas} viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="xMidYMid meet" className="spatial-svg" role="group" aria-label="Interactive network map" onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('[role="button"], .spatial-label'))return;const point=scenePoint(e.currentTarget,e.clientX,e.clientY);drag.current={x:point.x,y:point.y,camera};setDragging(true);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current)return;const point=scenePoint(e.currentTarget,e.clientX,e.clientY);setCamera({...drag.current.camera,x:Math.max(-900,Math.min(900,drag.current.camera.x+point.x-drag.current.x)),y:Math.max(-650,Math.min(650,drag.current.camera.y+point.y-drag.current.y))});}} onPointerUp={()=>{drag.current=null;setDragging(false);}} onPointerCancel={()=>{drag.current=null;setDragging(false);}}>
        <defs>
          <radialGradient id="spatial-blue" cx="30%" cy="24%" r="78%"><stop stopColor="#c5f3ff"/><stop offset=".22" stopColor="#49a7cf"/><stop offset=".64" stopColor="#216787"/><stop offset="1" stopColor="#103449"/></radialGradient>
          <radialGradient id="spatial-teal" cx="30%" cy="24%" r="78%"><stop stopColor="#d4fff0"/><stop offset=".24" stopColor="#6dd8bb"/><stop offset=".68" stopColor="#258a82"/><stop offset="1" stopColor="#104c58"/></radialGradient>
          <radialGradient id="spatial-amber" cx="30%" cy="24%" r="78%"><stop stopColor="#fff7cd"/><stop offset=".25" stopColor="#ecc177"/><stop offset=".7" stopColor="#b07f39"/><stop offset="1" stopColor="#594726"/></radialGradient>
          <radialGradient id="spatial-red" cx="30%" cy="24%" r="78%"><stop stopColor="#ffe7cb"/><stop offset=".25" stopColor="#e8a181"/><stop offset=".7" stopColor="#a44e47"/><stop offset="1" stopColor="#4c2936"/></radialGradient>
          <marker id="spatial-direction" viewBox="0 0 10 10" refX="38" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5 0 10" fill="#92bebc"/></marker>
        </defs>
        <g className="spatial-world" style={{transform:`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`}} data-camera-scale={camera.scale} data-view-mode={focused?'focused':'overview'}>
          {connections.map(edge=>{const unavailable=sim.closed.includes(edge.from)||sim.closed.includes(edge.to),active=safeRoute?.edgeIds.includes(edge.id),related=!focused||edge.from===focused||edge.to===focused;return <g key={edge.id} className={`spatial-link ${unavailable?'is-unavailable':''} ${active?'is-active':''} ${related?'is-related':'is-distant'}`} data-route-edge={active?edge.id:undefined}><title>{name(edge.from)} → {name(edge.to)} · {edge.hours} hrs · ${fmt(edge.cost)} · {edge.capacity} t capacity{unavailable?' · unavailable':''}</title><path className="spatial-link-depth" d={spatialPath(edge.from,edge.to,points)} transform="translate(0 9)"/><path className="spatial-link-line" d={spatialPath(edge.from,edge.to,points)} markerEnd="url(#spatial-direction)"/>{active&&<path key={routeKey} className="spatial-new-route" d={spatialPath(edge.from,edge.to,points)}/>}</g>;})}
          {oldRoute?.edgeIds.filter(id=>!safeRoute?.edgeIds.includes(id)).map(id=>{const edge=connections.find(e=>e.id===id)!;return <path key={`${lastEvent?.id}-${id}`} className="spatial-retired-route" d={spatialPath(edge.from,edge.to,points)} aria-hidden="true"/>;})}
          {hubs.map(h=>{const p=points[h.id],closed=sim.closed.includes(h.id),related=neighborhood.has(h.id),chosen=focused===h.id;const r=spatialRadius(h.type,camera.scale);return <g key={h.id} className={`spatial-hub ${related?'':'is-distant'} ${closed?'is-closed':''} ${chosen?'is-chosen':''}`} role="button" tabIndex={0} aria-label={`Inspect ${h.label}`} aria-pressed={chosen} onClick={()=>focus(h.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus(h.id);}if(e.key==='Escape'){overview();e.preventDefault();}}}>
            <title>{h.label} · {h.type} · {closed?'closed':'available'}</title><circle cx={p.x} cy={p.y} r={r+15} fill="transparent"/><ellipse className="spatial-shadow" cx={p.x+6} cy={p.y+40/Math.min(1,camera.scale)} rx={r*1.2} ry="7"/>{chosen&&<ellipse className="spatial-orbit" cx={p.x} cy={p.y+6} rx={r+15} ry={r+8}/>}
            <circle className="spatial-sphere" cx={p.x} cy={p.y} r={r} fill={`url(#${closed?'spatial-red':chosen?'spatial-teal':h.type==='mill'||h.type==='destination'?'spatial-amber':'spatial-blue'})`}/><ellipse className="spatial-specular" cx={p.x-r*.29} cy={p.y-r*.4} rx={r*.32} ry={r*.18} transform={`rotate(-30 ${p.x-r*.29} ${p.y-r*.4})`}/>
            {closed&&<path className="spatial-cross" d={`M${p.x-7} ${p.y-7}l14 14m-14 0l14-14`}/>}

          </g>;})}
          {position&&<g className="spatial-freight" transform={`translate(${position.x} ${position.y})`} aria-label="Simulated shipment marker" data-freight-edge={marker?.edge.id}><circle r="8"/><path d="M-3-3h6v6h-6z"/></g>}
        </g>
        <g className="spatial-labels" aria-hidden="true">
          {hubs.map(h=>{const p=points[h.id],r=spatialRadius(h.type,camera.scale);return <g key={h.id} className={`spatial-label ${neighborhood.has(h.id)?'':'is-distant'}`} style={{transform:`translate(${p.x*camera.scale+camera.x}px, ${p.y*camera.scale+camera.y}px)`}} onClick={()=>focus(h.id)}>
            <g className="spatial-label-offset" style={{transform:`translateY(${-r*camera.scale-40}px)`}}><rect className="spatial-label-bg" x="-86" y="0" width="172" height="28" rx="14"/><text className="spatial-hub-name" x="0" y="19">{h.label}</text></g>
            {sim.closed.includes(h.id)&&<text className="spatial-closed-label" x="0" y={r*camera.scale+27}>CLOSED</text>}
          </g>;})}
        </g>
      </svg></div>
      {!focused&&<div className="spatial-invitation"><span className="spatial-eyebrow">EXPLORE THE CORRIDOR</span><p>Select a hub to explore.</p><small>Drag to pan · + / − to zoom</small></div>}
      {selected&&<aside className="spatial-inspector" aria-label="Contextual hub inspector"><div className="spatial-inspector-heading"><span className="spatial-eyebrow">{selected.type} / {sim.closed.includes(selected.id)?'CLOSED':'AVAILABLE'}</span><button aria-label="Close hub inspector" onClick={overview}>×</button></div><h2>{selected.label}</h2><p>{roles[selected.type]}</p><div className="spatial-neighbors"><span className="spatial-eyebrow">CONNECTED HUBS</span>{connections.filter(e=>e.from===selected.id||e.to===selected.id).map(e=><button key={e.id} onClick={()=>focus(e.from===selected.id?e.to:e.from)} aria-label={`Focus ${name(e.from===selected.id?e.to:e.from)}`}><span>{e.from===selected.id?'↗':'↙'} {name(e.from===selected.id?e.to:e.from)}</span><small>{e.from===selected.id?'Outgoing':'Incoming'} · {e.hours} h · {e.capacity} t</small></button>)}</div>
        {canDisrupt(selected.id,sim.origin,sim.destination)||sim.closed.includes(selected.id)?<button className={`button ${sim.closed.includes(selected.id)?'primary':'danger-light'}`} aria-label={`${sim.closed.includes(selected.id)?'Restore':'Disrupt'} ${selected.label}`} onClick={()=>sim.toggleHub(selected.id)}>{sim.closed.includes(selected.id)?'Restore this hub':'Disrupt this hub'}</button>:<p className="spatial-protected">Protected planning endpoint</p>}
      </aside>}
      <div className="spatial-camera-tools" role="group" aria-label="Camera controls"><button aria-label="Zoom in" onClick={()=>setCamera(c=>zoomCamera(c,1.15,viewport))}>+</button><button aria-label="Zoom out" onClick={()=>setCamera(c=>zoomCamera(c,1/1.15,viewport))}>−</button><button aria-label="Pan left" onClick={()=>pan(80,0)}>←</button><button aria-label="Pan right" onClick={()=>pan(-80,0)}>→</button><button aria-label={sim.playing?'Pause shipment movement':'Resume shipment movement'} disabled={!safeRoute} onClick={sim.setPlaying}>{sim.playing?'Pause cargo':'Move cargo'}</button></div>
    </div>
    <div className="spatial-consequence" role="status">{incident??'Select any hub to inspect its connections; close an intermediate hub to test a real route change.'}</div>
    <footer className="spatial-dispatch"><div>{safeRoute?<><span className="spatial-eyebrow">{sim.committed?'APPLIED ROUTE':'SELECTED FEASIBLE ROUTE'}</span><strong>{safeRoute.hours} hrs <span>·</span> ${fmt(safeRoute.cost)}</strong><p title={safeRoute.ids.map(name).join(' → ')}>{safeRoute.ids.map(name).join(' → ')}</p></>:<p className="no-route">No directed route is available. Restore an unavailable hub or choose another pair.</p>}</div>{safeRoute&&<button className="button primary" onClick={sim.applyRoute}>Apply this route</button>}<div className="spatial-footnote"><span><i/> Active route</span><span><i/> Unavailable</span><span><i/> Alternate link</span><small>Fictional spatial layout · No geographic accuracy or live GPS implied.</small></div></footer>
  </section>;
}
