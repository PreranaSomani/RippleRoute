import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

// Compile the complete application dependency graph, including shared TS logic.
// Keep npm packages external so Vercel can trace their Node-specific dependencies.
const result=await build({
  absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),
  entryPoints:['server/vercel-entry.mjs'],
  outfile:'server/generated/vercel.mjs',
  bundle:true,
  platform:'node',
  format:'esm',
  target:'node22',
  packages:'external',
  sourcemap:false,
  metafile:true,
  logLevel:'info'
});
for(const output of Object.values(result.metafile.outputs)){
  if(output.imports.some(i=>i.path.startsWith('.')||/\.tsx?$/.test(i.path)))throw new Error('Production bundle contains an unresolved source import.');
}
