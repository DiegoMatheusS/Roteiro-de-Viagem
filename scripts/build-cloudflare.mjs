import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';

mkdirSync('cloudflare-dist',{recursive:true});
const result=await build({
  entryPoints:['cloudflare/index.ts'],outfile:'cloudflare-dist/worker.js',
  bundle:true,format:'esm',platform:'node',target:'es2022',
  mainFields:['module','main'],external:['cloudflare:node','cloudflare:workers'],
  sourcemap:true,metafile:true,
  // Workerd supports requiring Node built-ins. Third-party code is bundled.
  banner:{js:"import {createRequire as createNodeRequire} from 'node:module'; const require=createNodeRequire(import.meta.url);"},
});
if(Object.keys(result.metafile.inputs).some(path=>/node_modules\/(?:sharp|@img\/)/.test(path)))
  throw Error('O pacote Cloudflare não pode carregar módulos nativos de imagem.');
if(Object.keys(result.metafile.inputs).includes('server/db.ts'))
  throw Error('O pacote Cloudflare não pode abrir o banco SQLite local do Node.');
console.log('Backend Cloudflare compilado sem módulos nativos ou banco local.');
