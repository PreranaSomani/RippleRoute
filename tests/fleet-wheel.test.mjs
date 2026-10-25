import test from 'node:test';
import assert from 'node:assert/strict';
import {bindFleetWheelZoom} from '../src/fleetWheelZoom.ts';
function wheel(props={}){const event=new Event('wheel',{cancelable:true});Object.assign(event,{altKey:false,ctrlKey:false,deltaY:60,deltaMode:0,...props});return event;}
test('ordinary mouse and trackpad wheel events remain uncancelled and never zoom',()=>{
 const target=new EventTarget(),factors=[];const cleanup=bindFleetWheelZoom(target,f=>factors.push(f));
 for(const deltaY of [120,.5,-2]){const e=wheel({deltaY});target.dispatchEvent(e);assert.equal(e.defaultPrevented,false);}
 assert.deepEqual(factors,[]);cleanup();
});
test('Option and Ctrl wheel intentionally cancel scrolling and zoom in the correct direction',()=>{
 const target=new EventTarget(),factors=[];const cleanup=bindFleetWheelZoom(target,f=>factors.push(f));
 for(const props of [{altKey:true,deltaY:-60},{ctrlKey:true,deltaY:60}]){const e=wheel(props);target.dispatchEvent(e);assert.equal(e.defaultPrevented,true);}
 assert.ok(factors[0]>1);assert.ok(factors[1]<1);
 const horizontal=wheel({altKey:true,deltaY:0});target.dispatchEvent(horizontal);assert.equal(horizontal.defaultPrevented,false);
 cleanup();const e=wheel({ctrlKey:true});target.dispatchEvent(e);assert.equal(e.defaultPrevented,false);assert.equal(factors.length,2);
});
