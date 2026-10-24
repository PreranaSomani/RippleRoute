import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const hooks=url(`let state=[],index=0;export function render(fn){index=0;return fn()}export function useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]}export const useMemo=fn=>fn();`);
const {render}=await import(hooks);
const app=compile('../src/App.tsx').replace(/from ['"]react['"]/g,`from '${hooks}'`).replace(/from ['"]\.\/network['"]/g,`from '${url(compile('../src/network.ts'))}'`).replace(/from ['"](react\/jsx-runtime|lucide-react)['"]/g,(_,name)=>`from '${import.meta.resolve(name)}'`);
const {default:App}=await import(url(app));
function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
const text=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):text(node?.props?.children??'');
let tree;
const update=()=>tree=render(App);
const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);
const inspect=label=>{nodes(tree).find(n=>n.props?.['aria-label']===`Inspect ${label}`).props.onClick();update();};
test('hub selection, disruption, restoration, no-route state, protected endpoints, and reset',()=>{
  update();
  for(const label of ['Central Junction','Allegheny Rail','Union Depot']){
    inspect(label);assert.ok(nodes(tree).some(n=>n.type==='h2'&&text(n).trim()===label));
    button('Disrupt this hub').props.onClick();update();assert.ok(button('Restore this hub'));
    button('Restore this hub').props.onClick();update();assert.ok(button('Disrupt this hub'));
  }
  for(const label of ['Steelworks','Build Site']){inspect(label);assert.equal(button('Disrupt this hub'),undefined);}
  for(const label of ['Allegheny Rail','Inland Yard']){inspect(label);button('Disrupt this hub').props.onClick();update();}
  assert.ok(nodes(tree).some(n=>n.props?.className==='no-route'));
  assert.equal(button('Apply this route'),undefined);
  nodes(tree).find(n=>n.props?.['aria-label']==='Reset scenario').props.onClick();update();
  assert.ok(button('Apply this route'));assert.ok(button('Disrupt this hub'));
});
