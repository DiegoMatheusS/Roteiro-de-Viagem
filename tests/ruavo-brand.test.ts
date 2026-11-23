import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {RUAVO_BRAND} from '../src/services/ruavoBrand';

const read=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('RUAVO identity and official palette match in UI',()=>{
  assert.equal(RUAVO_BRAND.name,'RUAVO');
  assert.equal(RUAVO_BRAND.tagline,'Muito além da rota.');
  assert.deepEqual(RUAVO_BRAND.colors,{blue:'#175CD3',teal:'#14B8A6',amber:'#F59E0B',background:'#FFFFFF'});
  const home=read('src/components/NavigationHome.tsx');
  assert.match(home,/>RUAVO <span/);
  assert.match(home,/Muito além da rota/);
  assert.match(home,/ruavo-logo\.png/);
  assert.match(read('src/role-figma.css'),/--ruavo-blue:#175CD3/);
  assert.match(read('src/index.css'),/--color-teal-500: #14B8A6/);
});
test('browser startup and share metadata show RUAVO with approved white-background icon',()=>{
  const html=read('index.html'),startup=read('src/components/StartupMap.tsx');
  assert.match(html,/<title>RUAVO/);
  assert.match(html,/name="theme-color" content="#175CD3"/);
  assert.match(html,/rel="icon" type="image\/png" href="\/ruavo-logo\.png\?v=2"/);
  assert.match(startup,/Preparando o RUAVO/);
  assert.match(startup,/src="\/ruavo-logo\.png"/);
  const icon=readFileSync(new URL('../public/ruavo-logo.png',import.meta.url));
  assert.ok(icon.length>1000);
  assert.equal(icon.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16),256);
  const {data,width,height}=PNG.sync.read(icon);
  for(const [x,y] of [[0,0],[width-1,0],[0,height-1],[width-1,height-1],[128,15]]){
    const offset=(y*width+x)*4;
    assert.deepEqual([...data.subarray(offset,offset+4)],[255,255,255,255]);
  }
});
test('Android app name, legacy package ID, splash and all launcher resources updated',()=>{
  assert.match(read('capacitor.config.ts'),/appName: 'RUAVO'/);
  assert.match(read('capacitor.config.ts'),/br\.com\.roteirodeviagem\.app/);
  assert.match(read('android/app/src/main/res/values/strings.xml'),/name="app_name">RUAVO/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'),/android:icon="@drawable\/ruavo_logo"/);
  assert.match(read('android/app/src/main/res/values/styles.xml'),/@drawable\/ruavo_splash/);
  assert.match(read('android/app/src/main/res/drawable/ruavo_splash.xml'),/@drawable\/ruavo_logo/);
  const bytes=readFileSync(new URL('../android/app/src/main/res/drawable-nodpi/ruavo_logo.png',import.meta.url));
  assert.deepEqual(bytes,readFileSync(new URL('../public/ruavo-logo.png',import.meta.url)));
  assert.match(read('android/app/src/main/res/values/colors.xml'),/#175CD3/);
});
