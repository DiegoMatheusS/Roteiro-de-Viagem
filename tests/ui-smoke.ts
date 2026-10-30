import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import sharp from 'sharp';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';

// Provider fixtures exist only in this test. Production never seeds stations/prices.
const mapFetch: typeof fetch = async (url: any, options?: any) => {
  if (String(url).includes('photon')) return new Response(JSON.stringify({ features: [
    { geometry: { type: 'Point', coordinates: [-46.62, -23.54] }, properties: { osm_type: 'N', osm_id: 901, name: 'Parada Alfa de teste', city: 'São Paulo', osm_value: 'city' } },
    { geometry: { type: 'Point', coordinates: [-46.60, -23.53] }, properties: { osm_type: 'N', osm_id: 902, name: 'Parada Beta de teste', city: 'São Paulo', osm_value: 'restaurant' } }
  ] }));
  if (String(url).includes('/interpreter') && new URLSearchParams(String(options?.body)).get('data')?.includes('node(456)')) return new Response(JSON.stringify({ elements: [{ type: 'node', id: 456, lat: -23.5402, lon: -46.6202, tags: { amenity: 'restaurant', name: 'Restaurante de teste da interface', 'addr:street': 'Rua de teste' } }] }));
  if (String(url).includes('/interpreter') && new URLSearchParams(String(options?.body)).get('data')?.includes('nwr(around:')) return new Response(JSON.stringify({ elements: [
    { type: 'node', id: 991, lat: -23.46, lon: -46.52, tags: { tourism: 'viewpoint', name: 'Mirante verificado no teste' } },
    { type: 'node', id: 992, lat: -23.43, lon: -46.48, tags: { amenity: 'cafe', name: 'Café verificado no teste' } }
  ] }));
  if (String(url).includes('/interpreter')) return new Response(JSON.stringify({ elements: [{ type: 'node', id: 123, lat: -23.551, lon: -46.629, tags: { amenity: 'fuel', name: 'Posto de teste de interface', opening_hours: '24/7' } }] }));
  if (String(url).includes('open-meteo')) return new Response(JSON.stringify({ error: true }), { status: 503 });
  const coordinates = String(url).split('/driving/')[1].split('?')[0].split(';');
  const geometric = String(url).includes('geometries=geojson');
  const distance = geometric ? (coordinates.length - 1) * 20000 : coordinates.includes('-46.629,-23.551') ? 102000 : 100000;
  return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance, duration:600 * (coordinates.length-1), legs: coordinates.slice(1).map(() => ({ distance: distance / (coordinates.length - 1), duration: 600 })), geometry: { type: 'LineString', coordinates: coordinates.map(point => point.split(',').map(Number)) } }] }));
};
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-ui-'));
const db = openDatabase(':memory:');
// O teste percorre muitas telas e duas contas no mesmo IP em menos de um minuto.
// Mantém os limites específicos de login, cadastro e contribuições intactos.
const api = createApi({ db, photoDirectory: path.join(directory, 'photos'), mapFetch, requestLimitPerMinute: 1000 });
const server = api.listen(3001, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const vite = await createServer({ server: { host: '127.0.0.1', port: 3000, strictPort: true } });
await vite.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, executablePath, args: executablePath ? ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: -23.551, longitude: -46.629, accuracy: 3 } });
// Stable GPS fixture confined to the main smoke-test context. Chromium's
// native mock can time out when a busy CI runner repeatedly mounts the map.
// A JavaScript string avoids tsx/esbuild's __name helper leaking into the
// browser when Playwright serializes a TypeScript arrow function.
const stableGeolocationScript = `(() => {
  let nextId = 0;
  const timers = new Map();
  Object.defineProperty(window, '__activeGpsWatchers', { get: () => timers.size });
  const position = () => ({
    coords: { latitude: -23.551, longitude: -46.629, accuracy: 3,
      altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now()
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success) {
        window.setTimeout(() => success(position()), 0);
      },
      watchPosition(success) {
        const id = ++nextId;
        timers.set(id, window.setInterval(() => success(position()), 3000));
        window.setTimeout(() => { if (timers.has(id)) success(position()); }, 0);
        return id;
      },
      clearWatch(id) {
        const timer = timers.get(id);
        if (timer !== undefined) window.clearInterval(timer);
        timers.delete(id);
      }
    }
  });
})();`;
await context.addInitScript({ content:stableGeolocationScript });
const page = await context.newPage();
const adminBrowser = executablePath ? await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }) : browser;
const adminContext = await adminBrowser.newContext({ viewport: { width: 1365, height: 900 } });
const adminPage = await adminContext.newPage();
adminPage.setDefaultTimeout(15000);
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
adminPage.on('pageerror', error => errors.push(error.message));
fs.mkdirSync('test-results', { recursive: true });
try {
  // Keep this deterministic and offline except the local API: tile/font services are not under test.
  const blankMapTile=await sharp({create:{width:256,height:256,channels:3,background:'#eaf0ef'}}).png().toBuffer();
  await page.route(/^https:\/\//,route=>{
    const url=route.request().url();
    if(url.startsWith('https://tiles.openfreemap.org/'))return route.fulfill({json:{version:8,sources:{},
      layers:[{id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}});
    if(/tile\.openstreetmap\.org\//.test(url))return route.fulfill({contentType:'image/png',body:blankMapTile});
    return route.abort();
  });
  await page.goto('http://127.0.0.1:3000');
  await page.goto('http://127.0.0.1:3000/admin');
  await page.getByRole('heading', { name: 'Acesso exclusivo do administrador' }).waitFor();
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('heading', {name:'Bora dar um rolê?'}).waitFor();
  await page.screenshot({ path:'test-results/figma-tela-1-inicio.png' });
  // Tela 6: filtros, métricas reais, estado vazio e CTAs iguais ao PNG do Figma.
  await page.getByRole('button',{name:'Aba Viagens'}).click();
  const tripsPage=page.getByRole('region',{name:'Minhas viagens'});
  await tripsPage.getByRole('heading',{name:'Minhas viagens',exact:true}).waitFor();
  const stats=tripsPage.getByLabel('Resumo de viagens');
  await stats.getByText('0 km').waitFor();
  await tripsPage.getByRole('heading',{name:'Seu primeiro rolê começa aqui'}).waitFor();
  const tripsBounds=await tripsPage.boundingBox();
  const artBounds=await tripsPage.locator('.rdv-trips-empty-art').boundingBox();
  const createBounds=await tripsPage.getByRole('button',{name:'Criar meu primeiro rolê'}).boundingBox();
  assert.ok(tripsBounds&&artBounds&&createBounds&&
    tripsBounds.height>=840&&
    artBounds.y>260&&artBounds.y<410&&
    createBounds.y>560&&createBounds.y<730,
    'Tela 6 deve manter ilustração central e CTA abaixo, conforme o Figma');
  await page.screenshot({path:'test-results/figma-tela-6-viagens.png'});
  await tripsPage.getByRole('button',{name:'Planejadas'}).click();
  await tripsPage.getByRole('heading',{name:'Planeje seu próximo rolê'}).waitFor();
  await tripsPage.getByRole('button',{name:'Salvas'}).click();
  await tripsPage.getByRole('heading',{name:'Salve os lugares que quer conhecer'}).waitFor();
  await tripsPage.getByRole('button',{name:'Explorar passeios'}).click();
  await page.getByRole('heading',{name:'Explorar',exact:true}).waitFor();
  await page.getByRole('button',{name:'Aba Viagens'}).click();
  await tripsPage.getByRole('button',{name:/^Criar (meu primeiro )?rolê$/}).click();
  await page.getByRole('heading',{name:'Bora dar um rolê?'}).waitFor();

  // Tela 5: regressão visual e funcional do novo Explorar em largura Android.
  await page.getByRole('button',{name:'Aba Explorar'}).click();
  const exploring=page.getByRole('region',{name:'Explorar passeios'});
  await exploring.getByRole('heading',{name:'Explorar',exact:true}).waitFor();
  await exploring.getByPlaceholder('Buscar passeios').waitFor();
  await page.getByRole('button',{name:'Aba Explorar'}).getAttribute('aria-current')
    .then(current=>assert.equal(current,'page'));
  await exploring.getByRole('button',{name:'Todos',exact:true}).click();
  assert.equal(await exploring.locator('.rdv-explore-route-row').count(),20);
  await exploring.getByRole('button',{name:'Mostrar mais',exact:true}).click();
  assert.equal(await exploring.locator('.rdv-explore-route-row').count(),40);
  await exploring.getByPlaceholder('Buscar passeios').fill('Ibirapuera');
  await exploring.getByRole('heading',{name:'Parque Ibirapuera',exact:true}).waitFor();
  const parkPhoto=exploring.getByRole('img',{name:'Fotografia de Parque Ibirapuera',exact:true,includeHidden:true});
  assert.match((await parkPhoto.getAttribute('src'))!,/^https:\/\//);
  await exploring.getByPlaceholder('Buscar passeios').fill('');
  const exploreBox=await exploring.boundingBox();
  const exploreSheet=await exploring.locator('.rdv-explore-sheet').boundingBox();
  assert.ok(exploreBox&&exploreSheet&&exploreBox.height>=840&&
    exploreSheet.y>360&&exploreSheet.y<480,
    'Tela Explorar precisa ter mapa superior e folha inferior conforme PNG');
  await page.screenshot({path:'test-results/figma-tela-5-explorar.png'});
  await exploring.getByRole('button',{name:'Estrada',exact:true}).click();
  await exploring.getByRole('heading',{name:'Estrada dos Romeiros'}).waitFor();
  assert.equal(await exploring.getByRole('heading',{name:'Parque Ibirapuera',exact:true}).count(),0);
  await exploring.getByRole('button',{name:'Perto de mim'}).click();
  await exploring.getByPlaceholder('Buscar passeios').fill('Ibirapuera');
  assert.equal(await exploring.getByRole('heading',{name:'Estrada dos Romeiros'}).count(),0);
  await exploring.getByPlaceholder('Buscar passeios').fill('campos do jordao');
  await exploring.getByRole('heading',{name:'Campos do Jordão',exact:true}).waitFor();
  await exploring.getByPlaceholder('Buscar passeios').fill('');
  await exploring.getByRole('button',{name:'Cultura',exact:true}).click();
  await exploring.getByPlaceholder('Buscar passeios').fill('pinacoteca');
  await exploring.getByRole('heading',{name:'Pinacoteca de São Paulo',exact:true}).waitFor();
  await exploring.getByPlaceholder('Buscar passeios').fill('');
  await exploring.getByRole('button',{name:'Cidades',exact:true}).click();
  assert.equal(await exploring.locator('.rdv-explore-route-row').count(),14);
  await exploring.getByRole('heading',{name:'Campos do Jordão',exact:true}).waitFor();
  await exploring.getByLabel('Região de São Paulo').selectOption('inland');
  await exploring.getByRole('button',{name:'Todos',exact:true}).click();
  await exploring.getByPlaceholder('Buscar passeios').fill('bauru');
  await exploring.getByRole('heading',{name:'Jardim Botânico Municipal de Bauru',exact:true}).waitFor();
  await exploring.getByPlaceholder('Buscar passeios').fill('');
  await exploring.getByLabel('Região de São Paulo').selectOption('coast');
  await exploring.getByPlaceholder('Buscar passeios').fill('rio santos');
  await exploring.getByRole('heading',{name:'Rodovia Rio–Santos',exact:true}).waitFor();
  await exploring.getByPlaceholder('Buscar passeios').fill('');
  await exploring.getByLabel('Região de São Paulo').selectOption('all');
  await exploring.getByRole('button',{name:'Cachoeiras',exact:true}).click();
  await exploring.getByRole('heading',{name:'Cachoeira dos Pretos',exact:true}).waitFor();
  await exploring.getByRole('button',{name:'Lagos',exact:true}).click();
  await exploring.getByRole('heading',{name:'Lago do Taboão',exact:true}).waitFor();
  await exploring.getByRole('button',{name:'Parques',exact:true}).click();
  await exploring.getByPlaceholder('Buscar passeios').fill('juquery');
  await exploring.getByRole('heading',{name:'Parque Estadual do Juquery',exact:true}).waitFor();
  await page.getByRole('button',{name:'Aba Início'}).click();
  await page.getByRole('heading',{name:'Bora dar um rolê?'}).waitFor();

  await page.getByRole('button', {name:'Rolê com origem e destino'}).waitFor();
  // KM/H can show a preview without login or garage; navigation starts on confirmation.
  const guestContext=await browser.newContext({
    viewport:{width:390,height:844},permissions:['geolocation'],
    geolocation:{latitude:-23.551,longitude:-46.629,accuracy:3}
  });
  // The guest trip also needs continuous fresh GPS updates; a single Chromium fix
  // becomes stale after six seconds and must not prevent route generation.
  await guestContext.addInitScript({content:stableGeolocationScript});
  const guestPage=await guestContext.newPage();
  const guestErrors:string[]=[];
  const modes:string[]=[];
  guestPage.on('pageerror',error=>guestErrors.push(error.message));
  await guestPage.route('https://**',route=>route.abort());
  await guestPage.route('**/api/routes/tourist',async route=>{
    const body=route.request().postDataJSON() as {
      mode:string;target:number;tripType:string;
      originCoords:[number,number];interests:string[];
      avoidWaypoints?:[number,number][][];
    };
    modes.push(body.mode);
    assert.ok(['km','hours'].includes(body.mode));
    assert.ok(body.target>0);
    assert.equal(body.tripType,'round_trip');
    assert.deepEqual(body.interests,[], 'default route should not invent sightseeing preferences');
    const origin=body.originCoords;
    const avoided=body.avoidWaypoints?.length||0;
    const via:[number,number]=[origin[0]+0.01+avoided*0.01,origin[1]+0.01+avoided*0.01];
    await route.fulfill({json:{
      title:'Passeio rápido para visitante',destinationName:'Seu ponto de partida',
      destinationCoords:origin,isCircular:true,distanceKm:40,durationMinutes:70,
      routePath:[origin,via,origin],routeSteps:[
        {coords:via,distanceFromStartKm:1,type:'turn',modifier:'right',name:'Via verificada'}
      ],waypoints:[origin,via,origin],stops:[],warnings:[
        'O roteiro real tem 40 km, diferente da sua preferência. Confira antes de iniciar.',
        'Não foi possível consultar atrações externas. Roteiro rodoviário verificado, sem atrações sugeridas.',
        'O roteiro retorna ao ponto inicial. Alguns trechos podem se repetir dependendo das estradas disponíveis.'
      ],
      routingSource:'OSRM',tollsStatus:'unknown'
    }});
  });
  await guestPage.goto('http://127.0.0.1:3000');
  await guestPage.getByRole('heading',{name:'Bora dar um rolê?'}).waitFor();
  for(const choice of [
    {name:/Por distância/,label:'Quantidade de quilômetros',amount:'40',mode:'km'},
    {name:/Por tempo/,label:'Quantidade de horas',amount:'1',mode:'hours'}
  ]) {
    const expectedVoice=choice.mode==='km';
    const homeVoice=guestPage.getByRole('button',{name:'Orientações por voz'});
    if((await homeVoice.getAttribute('aria-pressed'))!==String(expectedVoice))await homeVoice.click();
    await guestPage.getByRole('button',{name:choice.name}).click();
    const modal=guestPage.getByRole('dialog',{name:'Criar um rolê'});
    if(choice.mode==='km'){
      await modal.getByRole('heading',{name:'Criar rolê'}).waitFor();
      const screen=await modal.boundingBox();
      const panel=await modal.getByTestId('figma-create-trip-panel').boundingBox();
      assert.ok(screen && panel && screen.y < 2 && screen.height >= 840,
        'Criar Rolê deve ocupar a tela inteira, como o design Figma');
      assert.ok(panel.y > 0.3 * 844 && panel.y < 0.47 * 844,
        'Painel Criar Rolê deve deixar o mapa visível no topo');
      await guestPage.screenshot({path:'test-results/figma-tela-2-criar-role.png'});
    }
    await modal.getByLabel(choice.label).fill(choice.amount);
    if(choice.mode==='km'){
      await modal.getByRole('button',{name:'Aumentar quantidade'}).click();
      assert.equal(await modal.getByLabel(choice.label).inputValue(),'41',
        'O botão + deve acrescentar apenas 1 km, não 10 km');
      await modal.getByRole('button',{name:'Diminuir quantidade'}).click();
      assert.equal(await modal.getByLabel(choice.label).inputValue(),'40',
        'O botão − deve subtrair apenas 1 km');
    }
    assert.equal(await modal.getByText('Sem login ou veículo cadastrado.',{exact:false}).count(),0,'Design does not show redundant guest notice');
    const request=guestPage.waitForRequest(req=>
      new URL(req.url()).pathname==='/api/routes/tourist' && req.method()==='POST');
    await modal.getByRole('button',{name:'Ver meu trajeto'}).click();
    const sent=await request;
    assert.equal((sent.postDataJSON() as {mode:string}).mode,choice.mode);
    const realPreview=guestPage.getByRole('dialog',{name:'Visualizar viagem'});
    await realPreview.getByText('40 km',{exact:false}).first().waitFor();
    const previewBounds=await realPreview.boundingBox();
    const detailBounds=await realPreview.getByTestId('figma-preview-details').boundingBox();
    assert.ok(previewBounds&&previewBounds.y<2&&previewBounds.height>=840,
      'A prévia deve ocupar a tela inteira, conforme a terceira tela do Figma');
    assert.ok(detailBounds&&detailBounds.y>0.48*844&&detailBounds.y<0.7*844,
      'Mapa deve ocupar a maior parte superior e o painel iniciar no terço inferior');
    await realPreview.getByText('Trajeto verificado').waitFor();
    await realPreview.getByRole('button',{name:'Expandir mapa'}).click();
    await realPreview.getByRole('button',{name:'Recolher mapa'}).waitFor();
    await realPreview.getByRole('button',{name:'Recolher mapa'}).click();
    if(choice.mode==='km'){
      assert.equal(await realPreview.locator('.rdv-preview-notice').count(),1,
        'A prévia por KM mostra somente o aviso útil sobre a distância');
      const rerollRequest=guestPage.waitForRequest(req=>
        new URL(req.url()).pathname==='/api/routes/tourist' && req.method()==='POST');
      await realPreview.getByRole('button',{name:'Gerar outra rota'}).click();
      const reroll=await rerollRequest;
      assert.equal((reroll.postDataJSON() as any).avoidWaypoints.length,1,
        'O recarregamento precisa excluir a rota já exibida');
      await realPreview.getByRole('button',{name:'Gerar outra rota'}).waitFor();
      await guestPage.screenshot({path:'test-results/figma-tela-3-previa.png'});
    }
    await realPreview.getByRole('button',{name:'Salvar rota'}).click();
    await realPreview.getByRole('button',{name:'Rota salva'}).waitFor();
    await realPreview.getByRole('button',{name:'Iniciar rolê'}).click();
    await guestPage.getByRole('status',{name:'Próxima orientação de navegação'}).waitFor();
    const navScreen=guestPage.getByLabel('Navegação GPS ativa');
    assert.equal(await guestPage.getByLabel('Início do Rolê',{exact:true}).count(),0,
      'navigation must dispose the covered home map and its GPS subscription');
    assert.equal(await guestPage.locator('main').count(),0,
      'covered tabs must not retain a second live map during navigation');
    await guestPage.waitForFunction(()=>(window as any).__activeGpsWatchers===1);
    await navScreen.locator('[data-map-engine]').waitFor();
    assert.equal(await guestPage.locator('[data-map-engine]').count(),1,
      'only the visible navigation renderer may remain mounted');
    await navScreen.locator('.rdv-nav-bottom-actions').waitFor();
    assert.equal(await navScreen.locator('.rdv-nav-bottom-button').count(),3,
      'A tela 4 deve exibir somente Encerrar, Compartilhar e SOS no rodapé');
    const navGeometry=await navScreen.boundingBox();
    const bottomGeometry=await navScreen.locator('.rdv-nav-bottom').boundingBox();
    assert.ok(navGeometry&&bottomGeometry&&
      navGeometry.y<2&&navGeometry.height>=840&&
      bottomGeometry.y>0.65*844&&bottomGeometry.y<0.85*844,
      'Navegação deve ocupar toda a tela e reservar um painel compacto inferior');
    const navigationVoice=navScreen.getByRole('button',{name:'Orientações por voz'});
    await navigationVoice.waitFor();
    assert.equal(await navigationVoice.getAttribute('aria-pressed'),String(expectedVoice),
      'A navegação deve respeitar o som escolhido na Home');
    await navScreen.getByRole('status',{name:/Velocímetro/}).waitFor();
    if(choice.mode==='km'){
      await guestPage.screenshot({path:'test-results/figma-tela-4-navegacao.png'});
      await navScreen.getByRole('button',{name:'Compartilhar',exact:true}).click();
      const sharing=guestPage.getByRole('dialog',{name:'Compartilhar viagem'});
      await sharing.getByRole('button',{name:'Fechar compartilhamento'}).click();
    }
    assert.equal(await guestPage.getByRole('button',{name:'Voltar ao menu e manter viagem ativa'}).count(),0,
      'A tela de navegação não pode manter o cabeçalho branco');
    assert.equal(await guestPage.getByRole('button',{name:'Minimizar navegação'}).count(),0);
    assert.equal(await guestPage.getByRole('button',{name:'SOS',exact:true}).count(),1,
      'SOS deve ficar flutuante no topo');
    assert.equal(await guestPage.getByText('Seguir GPS',{exact:true}).count(),0,
      'Botão de localização deve ser apenas ícone, inclusive com mapa livre');
    const mapArea=guestPage.locator('.rdv-flat-map').last();
    const mapBox=await mapArea.boundingBox();
    assert.ok(mapBox&&mapBox.height>350,'O mapa de navegação deve ter bastante área disponível');
    assert.equal(await guestPage.getByLabel('Condições da rota').count(),0,
      'Informações de pedágios e clima não podem flutuar sobre o mapa');
    const conditionsToggle=guestPage.getByRole('button',{name:'Detalhes de clima e pedágios'});
    await conditionsToggle.click();
    await guestPage.getByLabel('Condições da rota').waitFor();
    assert.equal(await conditionsToggle.getAttribute('aria-expanded'),'true');
    await conditionsToggle.click();
    assert.equal(await guestPage.getByLabel('Condições da rota').count(),0);
    assert.equal(await guestPage.getByRole('dialog',{name:'Conta do viajante'}).count(),0);
    const guestSaved=await guestPage.evaluate(()=>{
      const raw=localStorage.getItem('rdv_private_v2_guest_trips')||'[]';
      return JSON.parse(raw) as Array<{vehicleId:string;estimatedFuelLiters:number}>;
    });
    assert.ok(guestSaved.some(t=>t.vehicleId==='role-guest-navigation'&&t.estimatedFuelLiters===0));
    await guestPage.getByRole('button',{name:'Encerrar viagem',exact:true}).click();
    await guestPage.getByRole('dialog',{name:'Encerrar viagem'}).getByRole('button',{name:'Sim, encerrar'}).click();
    await guestPage.getByRole('status',{name:'Próxima orientação de navegação'}).waitFor({state:'hidden'});
    await guestPage.getByLabel('Início do Rolê',{exact:true}).waitFor();
    await guestPage.waitForFunction(()=>(window as any).__activeGpsWatchers===1);
  }
  assert.deepEqual(modes,['km','km','hours'], 'A opção Outra rota refaz a busca por KM antes do teste por horas');
  assert.deepEqual(guestErrors,[]);
  await guestContext.close();
  // Um único botão Comboio abre a escolha Criar/Entrar sem sair do Início.
  const comboioHome = page.getByRole('button',{name:'Comboio',exact:true});
  await comboioHome.click();
  const actionModal = page.getByRole('dialog',{name:'Opções do comboio'});
  await actionModal.getByRole('button',{name:/Criar comboio/}).waitFor();
  await actionModal.getByRole('button',{name:/Entrar no comboio/}).click();
  const joinFromHome = page.getByRole('dialog',{name:'Entrar no comboio'});
  await joinFromHome.getByLabel('Código do comboio').waitFor();
  assert.equal(await page.getByRole('dialog',{name:'Opções do comboio'}).count(),0);
  await joinFromHome.getByRole('button',{name:'Fechar entrada no comboio'}).click();
  await comboioHome.click();
  await page.getByRole('dialog',{name:'Opções do comboio'}).getByRole('button',{name:/Criar comboio/}).click();
  const convoyCreate = page.getByRole('dialog',{name:'Criar Comboio'});
  await convoyCreate.getByText('Antes, escolha o percurso do comboio.').waitFor();
  await convoyCreate.getByRole('button',{name:'Entrar para criar'}).waitFor();
  await convoyCreate.getByRole('button',{name:'Fechar criação de comboio'}).click();
  await comboioHome.click();
  await page.getByRole('dialog',{name:'Opções do comboio'}).getByRole('button',{name:'Fechar opções do comboio'}).click();
  const homePanel = page.getByTestId('home-main-sheet');
  // Controles não sobem junto com o painel e o menu não pode cobrir o toque no mapa.
  const gpsFixedBefore=await page.getByRole('button',{name:'Atualizar GPS'}).boundingBox();
  const voiceFixedBefore=await page.getByRole('button',{name:'Orientações por voz'}).boundingBox();
  assert.ok(gpsFixedBefore&&voiceFixedBefore);
  assert.ok(gpsFixedBefore.y+gpsFixedBefore.height+6<=voiceFixedBefore.y,
    'GPS deve ficar acima do som, sem sobreposição');
  assert.ok(Math.abs(gpsFixedBefore.x-voiceFixedBefore.x)<2,
    'GPS e som devem ficar na mesma coluna à direita');
  assert.equal(await page.getByRole('status',{name:/Velocímetro/}).count(),0,
    'Velocímetro fica apenas na navegação');
  assert.equal(await page.getByRole('button',{name:'Reportar problema na estrada'}).count(),0,
    'Início mantém somente GPS e som na coluna de controles');
  assert.ok(gpsFixedBefore.width>=56&&voiceFixedBefore.width>=56,
    'Controles da Home devem ter uma área de toque maior');
  assert.equal(await page.getByRole('button',{name:'Abrir menu'}).count(),0,
    'Não deve haver hambúrguer redundante no topo do Início');
  const modeGroup=page.getByRole('group',{name:'Modalidade de transporte'});
  await modeGroup.getByRole('button',{name:'Carro'}).waitFor();
  await modeGroup.getByRole('button',{name:'Moto'}).click();
  assert.equal(await modeGroup.getByRole('button',{name:'Moto'}).getAttribute('aria-pressed'),'true');
  await modeGroup.getByRole('button',{name:'Carro'}).click();
  const initialHomeBounds = await homePanel.boundingBox();
  const inlineSearch=page.getByTestId('home-inline-destination-search');
  assert.equal(await inlineSearch.count(),1,'Busca de endereço deve aparecer dentro do painel');
  assert.equal(await homePanel.locator('[data-testid="home-inline-destination-search"]').count(),1,
    'A busca fica abaixo do título, e não sobre o mapa');
  assert.ok(initialHomeBounds && initialHomeBounds.y > 0.47 * 844,
    'O painel Início deve ficar mais alto para exibir a busca e ainda preservar o mapa');
  // Regression: dragging the Home grip must grow the sheet from the BOTTOM;
  // translating the entire sheet up exposed a second map strip below it.
  const homeGrip=page.locator('[data-panel-grip]');
  const homeGripBox=await homeGrip.boundingBox();
  assert.ok(homeGripBox);
  await page.mouse.move(homeGripBox!.x+homeGripBox!.width/2,homeGripBox!.y+homeGripBox!.height/2);
  await page.mouse.down();
  await page.mouse.move(homeGripBox!.x+homeGripBox!.width/2,homeGripBox!.y-145,{steps:9});
  const draggedBox=await homePanel.boundingBox();
  const sheetAnchor=await page.locator('.rdv-figma-bottom-nav').evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(draggedBox && Math.abs(draggedBox.y+draggedBox.height-sheetAnchor)<2,
    'Durante o gesto o painel deve permanecer ancorado na borda inferior, sem mostrar o mapa embaixo');
  assert.ok(draggedBox.height>initialHomeBounds!.height+110,
    'Puxar para cima deve aumentar a altura do painel, não mover todo o elemento');
  await page.mouse.up();
  await page.waitForFunction(()=>{
    const panel=document.querySelector('[data-testid="home-main-sheet"]')?.getBoundingClientRect();
    const screen=document.querySelector('.rdv-navigation-screen')?.getBoundingClientRect();
    const nav=document.querySelector('.rdv-figma-bottom-nav')?.getBoundingClientRect();return !!panel&&!!nav&&Math.abs(panel.bottom-nav.top)<2&&panel.height>=window.innerHeight*0.8;
  });
  const gpsFixedAfter=await page.getByRole('button',{name:'Atualizar GPS'}).boundingBox();
  const voiceFixedAfter=await page.getByRole('button',{name:'Orientações por voz'}).boundingBox();
  assert.ok(gpsFixedAfter&&voiceFixedAfter);
  for(const [before,after] of [[gpsFixedBefore,gpsFixedAfter],[voiceFixedBefore,voiceFixedAfter]]){
    assert.ok(Math.abs(before.x-after.x)<2 && Math.abs(before.y-after.y)<2,
      'Controles do mapa não devem acompanhar o movimento do painel');
  }
  const scrollHome=page.locator('[data-panel-scroll]');
  // O novo painel minimalista não precisa forçar rolagem quando todo o conteúdo cabe.
  const needsScroll=await scrollHome.evaluate(el=>el.scrollHeight>el.clientHeight);
  if(needsScroll){
    // CSS smooth scrolling can postpone scrollTop until the next animation frames.
    // Verify the actual reachable bottom, not the value synchronously after assignment.
    await scrollHome.evaluate(el=>{el.scrollTo({top:el.scrollHeight,behavior:'instant'});});
    await page.waitForFunction(()=>{
      const el=document.querySelector<HTMLElement>('[data-panel-scroll]');
      return !!el&&el.scrollTop>0&&Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<3;
    },undefined,{timeout:5000});
    await scrollHome.evaluate(el=>{el.scrollTo({top:0,behavior:'instant'});});
  }else{
    assert.ok(await scrollHome.evaluate(el=>el.clientHeight>0),'Conteúdo completo do painel deve permanecer visível');
  }
  // Pulling down returns to the normal position, still without a map gap.
  const expandedGripBox=await homeGrip.boundingBox();
  assert.ok(expandedGripBox);
  await page.mouse.move(expandedGripBox!.x+expandedGripBox!.width/2,expandedGripBox!.y+expandedGripBox!.height/2);
  await page.mouse.down();
  await page.mouse.move(expandedGripBox!.x+expandedGripBox!.width/2,expandedGripBox!.y+140,{steps:8});
  await page.mouse.up();
  await page.waitForFunction(()=>{
    const panel=document.querySelector('[data-testid="home-main-sheet"]')?.getBoundingClientRect();
    const screen=document.querySelector('.rdv-navigation-screen')?.getBoundingClientRect();
    const nav=document.querySelector('.rdv-figma-bottom-nav')?.getBoundingClientRect();return !!panel&&!!nav&&Math.abs(panel.bottom-nav.top)<2&&panel.height<=window.innerHeight*0.65;
  });

  // O navegador bloqueia o GPS por site; não é possível reabrir o prompt automaticamente.
  const blockedContext = await browser.newContext({viewport:{width:390,height:844}});
  await blockedContext.grantPermissions([], {origin:'http://127.0.0.1:3000'});
  const blockedPage = await blockedContext.newPage();
  await blockedPage.goto('http://127.0.0.1:3000');
  await blockedPage.getByRole('button',{name:'Permitir localização'}).waitFor();
  await blockedPage.getByRole('button',{name:'Permitir localização'}).click();
  await blockedPage.getByText(/ícone ao lado do endereço do site/).waitFor();
  await blockedContext.close();
  const homeGps = page.getByRole('button', {name:'Atualizar GPS'});
  const homeVoice = page.getByRole('button', {name:'Orientações por voz'});
  await homeGps.waitFor();
  await homeVoice.waitFor();
  const homeGpsBox = await homeGps.boundingBox();
  const homeVoiceBox = await homeVoice.boundingBox();
  assert.ok(homeGpsBox && homeVoiceBox &&
    homeGpsBox.y + homeGpsBox.height + 6 <= homeVoiceBox.y &&
    Math.abs(homeGpsBox.x-homeVoiceBox.x)<2,
    'GPS precisa ficar acima do som, em coluna vertical e sem sobreposição');
  await homeVoice.click();
  assert.equal(await homeVoice.getAttribute('aria-pressed'),'true');
  await homeVoice.click();
  assert.equal(await homeVoice.getAttribute('aria-pressed'),'false');
  if(!(await page.getByRole('button',{name:'Abrir menu'}).count())) await page.getByRole('button',{name:'Aba Perfil'}).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const roleMenu = page.getByRole('dialog', {name:'Menu do Rolê'});
  await roleMenu.getByRole('button', {name:'Começar um rolê'}).waitFor();
  assert.ok(parseFloat(await roleMenu.evaluate(el=>getComputedStyle(el).transitionDuration)) > 0, 'O menu deve entrar deslizando de baixo para cima');
  await roleMenu.getByRole('button', {name:'Abrir meu perfil'}).getByText('Entrar ou criar conta').waitFor();
  await roleMenu.getByRole('button', {name:'Abrir meu perfil'}).click();
  await page.getByRole('button', { name: 'Entrar / Criar conta' }).click();
  const login = page.getByRole('dialog', { name: 'Conta do viajante' });
  await login.getByRole('button', { name: 'Ainda não tenho conta' }).click();
  await login.getByLabel('Nome de exibição').fill('Viajante de teste');
  await login.getByLabel('E-mail', { exact: true }).fill('ui@example.test');
  await login.getByLabel('Senha', { exact: true }).fill('ui-test-password');
  await login.getByLabel('Repetir senha', { exact: true }).fill('different-password');
  await login.getByRole('button', { name: 'Criar minha conta' }).click();
  await login.getByRole('alert').filter({ hasText: 'As senhas não coincidem.' }).waitFor();
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM users WHERE email='ui@example.test'").get() as any).count, 0);
  await login.getByLabel('Repetir senha', { exact: true }).fill('ui-test-password');
  await login.getByRole('button', { name: 'Criar minha conta' }).click();
  await login.waitFor({ state: 'hidden' });
  // Tela 7: design Figma, nível real, garagem e acesso às funções detalhadas.
  const figmaProfile=page.getByRole('region',{name:'Perfil e garagem'});
  await figmaProfile.getByRole('heading',{name:'Perfil e garagem'}).waitFor();
  await figmaProfile.getByText('Nível Bronze').waitFor();
  await figmaProfile.getByLabel('Estatísticas do viajante').getByText('0 km').waitFor();
  const profileBounds=await figmaProfile.boundingBox();
  const progressBounds=await figmaProfile.getByRole('region',{name:'Progresso do nível'}).boundingBox();
  const garageBounds=await figmaProfile.getByRole('button',{name:'Cadastrar meu veículo'}).boundingBox();
  assert.ok(profileBounds&&progressBounds&&garageBounds&&
    profileBounds.height>=840&&progressBounds.y>160&&progressBounds.y<300&&
    garageBounds.y>355&&garageBounds.y<530,
    'Tela Perfil deve seguir posição do cartão de nível e da garagem no Figma');
  await page.screenshot({path:'test-results/figma-tela-7-perfil.png'});
  await figmaProfile.getByRole('button',{name:'Segurança e SOS'}).click();
  await page.getByText('Central SOS de Emergência').waitFor();
  await page.getByRole('button',{name:'Voltar ao perfil'}).click();
  await figmaProfile.getByRole('button',{name:'Configurações'}).click();
  await page.getByText('Configurações de Privacidade').waitFor();
  await page.getByRole('button',{name:'Voltar ao perfil'}).click();
  // O cadastro de veículos permanece no Perfil, não na antiga aba inferior.
  await page.getByRole('button', { name: 'Minha Garagem', exact: true }).click();
  await page.getByRole('button', { name: 'Novo Veículo', exact: true }).click();
  const vehicleForm=page.getByRole('dialog',{name:'Cadastrar veículo',exact:true});
  const vehicleYear=vehicleForm.getByLabel('Ano',{exact:true});
  const vehicleTank=vehicleForm.getByLabel('Capacidade do Tanque (Litros)',{exact:true});
  const vehicleConsumption=vehicleForm.getByLabel('Consumo Médio (km/l)',{exact:true});
  for(const input of [vehicleYear,vehicleTank,vehicleConsumption]){
    await input.fill('1');await input.press('Backspace');
    assert.equal(await input.inputValue(),'','deleting the last digit must leave the field empty');
  }
  await vehicleYear.fill('2024');
  await vehicleForm.getByRole('button',{name:'Consultar Especificações',exact:true}).click();
  assert.equal(await vehicleTank.inputValue(),'17.7');
  assert.equal(await vehicleConsumption.inputValue(),'27.6');
  await vehicleTank.fill('12,');
  assert.equal(await vehicleTank.inputValue(),'12,','a decimal separator must remain while typing');
  await vehicleTank.pressSequentially('5');
  assert.equal(await vehicleTank.inputValue(),'12,5');
  await vehicleConsumption.fill('0,5');
  assert.equal(await vehicleConsumption.inputValue(),'0,5','small consumption values must not become 15');
  await vehicleConsumption.fill('12.75');
  await vehicleTank.fill('0');
  await vehicleForm.getByRole('button',{name:'Salvar Veículo na Garagem',exact:true}).click();
  await vehicleForm.getByRole('alert').waitFor();
  await vehicleTank.fill('12,5');
  await page.getByRole('button', { name: 'Salvar Veículo na Garagem', exact: true }).click();
  await vehicleForm.waitFor({state:'hidden'});
  const registeredVehicle=await page.evaluate(()=>{
    const {user}=JSON.parse(localStorage.getItem('rdv_auth_cache_v1')!);
    return JSON.parse(localStorage.getItem('rdv_private_v2_'+user.id+'_vehicles')!)[0];
  });
  assert.equal(registeredVehicle.year,2024);
  assert.equal(registeredVehicle.tankCapacityLiters,12.5);
  assert.equal(registeredVehicle.consumption.userConfigured,12.75);
  if(!(await page.getByRole('button',{name:'Abrir menu'}).count())) await page.getByRole('button',{name:'Aba Perfil'}).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const accountMenu = page.getByRole('dialog', { name: 'Menu do Rolê' });
  await accountMenu.getByRole('button', { name: 'Abrir meu perfil' }).getByText('Viajante de teste').waitFor();
  await accountMenu.getByRole('button', { name: 'Início', exact: true }).click();

  // A busca da tela inicial é um input verdadeiro: teclado direto, sem formulário de origem/destino.
  const quickSearch = page.getByRole('searchbox', {name:'Para onde quer ir?'});
  await quickSearch.click();
  assert.equal(await quickSearch.evaluate(element=>document.activeElement===element),true,'O toque deve focar o input do teclado');
  assert.equal(await page.getByRole('dialog',{name:'Buscar destino no mapa'}).count(),0,'A busca rápida não abre modal');
  await quickSearch.fill('Parada');
  const choicesRequest = page.waitForResponse(response => response.url().endsWith('/api/routes/alternatives') && response.request().method()==='POST',{timeout:45000});
  await quickSearch.press('Enter');
  const destinationMap = page.getByRole('region', {name:'Destino no mapa'});
  await destinationMap.getByRole('heading', {name:'Parada Alfa de teste'}).waitFor();
  await destinationMap.getByText('Rotas disponíveis').waitFor();
  assert.equal((await choicesRequest).status(),200,'Enter deve calcular rotas automaticamente');
  await destinationMap.getByText('Rota mais rápida').waitFor();
  await page.waitForFunction(()=>{
    const raster=document.querySelectorAll('.leaflet-overlay-pane path').length>0;
    const vector=[...document.querySelectorAll('[data-role-vector-routes]')]
      .some(node=>Number(node.getAttribute('data-role-vector-routes'))>0);
    return raster||vector;
  },undefined,{timeout:10000});
  const routeButtons = destinationMap.locator('button[aria-pressed]');
  if (await routeButtons.count() > 1) {
    await routeButtons.nth(1).click();
    assert.equal(await routeButtons.nth(1).getAttribute('aria-pressed'),'true',
      'Selecionar uma alternativa atualiza a rota ativa no painel');
    // Raster draws gray Leaflet SVG alternatives; vector MapLibre has already
    // registered the verified alternative source and the card remains selectable.
    const hasGrayRaster=await page.locator('.leaflet-overlay-pane path[stroke="#64748b"]').count()>0;
    const vectorCount=await page.locator('[data-role-vector-routes]').first().getAttribute('data-role-vector-routes').catch(()=>null);
    assert.ok(hasGrayRaster||Number(vectorCount)>1,
      'Outras rotas continuam disponíveis no mapa no renderizador ativo');
  }
  // Regressão: antes o botão somente carregava opções sem abrir a navegação.
  await destinationMap.getByRole('button',{name:'Iniciar rota selecionada'}).click();
  await page.getByRole('status',{name:'Próxima orientação de navegação'}).waitFor();
  await page.getByRole('button',{name:'Encerrar viagem',exact:true}).click();
  await page.getByRole('dialog',{name:'Encerrar viagem'}).getByRole('button',{name:'Sim, encerrar'}).click();
  await page.getByRole('status',{name:'Próxima orientação de navegação'}).waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'Bora dar um rolê?'}).waitFor();
  assert.equal(await destinationMap.count(),0,
    'encerrar a navegação volta ao início sem restaurar a prévia desmontada');
  await page.waitForFunction(()=>(window as any).__activeGpsWatchers===1);
  // O formulário detalhado de origem e destino continua disponível separadamente.
  await page.getByRole('button', {name:'Rolê com origem e destino'}).click();
  const destinationSheet = page.getByRole('dialog', { name: 'Escolher origem e destino' });
  // Garante que a pesquisa manual funcione mesmo quando o GPS não respondeu ainda.
  await destinationSheet.getByRole('checkbox', { name: 'Sair da minha localização (GPS)' }).uncheck();
  await destinationSheet.getByLabel('Origem', { exact: true }).fill('Parada');
  await destinationSheet.getByRole('button', { name: 'Buscar origem', exact: true }).click();
  await destinationSheet.getByRole('button', { name: /Parada Beta de teste/ }).click();
  await destinationSheet.getByLabel('Destino', { exact: true }).fill('Parada');
  await destinationSheet.getByRole('button', { name: 'Buscar destino', exact: true }).click();
  await destinationSheet.getByRole('button', { name: /Parada Alfa de teste/ }).first().click();
  const roadRequest = page.waitForResponse(response => response.url().endsWith('/api/routes/alternatives') && response.request().method() === 'POST');
  await destinationSheet.getByRole('button', { name: 'Ver percurso', exact: true }).click();
  assert.equal((await roadRequest).status(), 200);
  const tripPreview = page.getByRole('dialog', { name: 'Visualizar viagem' });
  await tripPreview.getByRole('heading', { name: 'Parada Alfa de teste' }).waitFor();
  await tripPreview.locator('.leaflet-overlay-pane path, [data-role-vector-routes]').first().waitFor();
  const previewRaster=await tripPreview.locator('.leaflet-overlay-pane path').count()>0;
  const previewVectors=await tripPreview.locator('[data-role-vector-routes]').first().getAttribute('data-role-vector-routes').catch(()=>null);
  assert.ok(previewRaster||Number(previewVectors)>0,'A prévia precisa carregar a rota real');
  assert.ok((await tripPreview.innerText()).includes('km'), 'A prévia deve mostrar distância real');
  await tripPreview.getByRole('button', { name: 'Fechar janela' }).click();
  await page.getByRole('button', { name: 'Mais opções de planejamento', exact: true }).click();
  await page.getByRole('heading',{name:'Rolê',exact:true}).waitFor();
  await page.getByRole('button',{name:'Voltar ao Rolê'}).waitFor();
  const vehicleSelector=page.getByTitle('Toque para trocar de veículo rapidamente');
  const vehicleRect=await vehicleSelector.boundingBox();
  assert.ok(vehicleRect && vehicleRect.width>=152,'O seletor do veículo deve ficar mais largo no planejamento');
  // GPS modes must ignore even an incomplete draft in the manual destination tab.
  await page.getByRole('button', { name: 'Origem e destino', exact: true }).click();
  await page.getByLabel('Origem', { exact: true }).fill('Origem manual ainda não selecionada');
  await page.getByLabel('Destino', { exact: true }).fill('Destino manual ainda não selecionado');
  await page.getByRole('button', { name: '+ Adicionar parada', exact: true }).click();
  await page.getByRole('button', { name: 'Por Km', exact: true }).click();
  assert.equal(await page.getByLabel('Origem', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Destino', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '+ Adicionar parada', exact: true }).count(), 0);

  // Planejamento ida e volta: nao corrigir a digitacao; exibir o erro em vermelho.
  const kmEntry = page.locator('input[aria-describedby="tourist-km-warning"]');
  await kmEntry.fill('9');
  assert.equal(await kmEntry.inputValue(), '9');
  await page.getByText('KM muito baixo — o trajeto pode ser limitado.', { exact: true }).waitFor();
  await kmEntry.fill('10');
  assert.equal(await page.locator('#tourist-km-warning').innerText(), '');
  await kmEntry.fill('100');
  await page.getByRole('button', { name: 'Por Horas', exact: true }).click();
  assert.equal(await page.getByLabel('Origem', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Destino', { exact: true }).count(), 0);
  await page.screenshot({ path: 'test-results/home-gps-hours-mobile.png', fullPage: true });
  const hoursRequest = page.waitForRequest(request => request.url().endsWith('/api/routes/tourist'));
  // Fail after capturing the request so the hours form stays open for validation below.
  await page.route('**/api/routes/tourist', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Indisponível no teste de horas' }) }));
  await page.getByRole('button', { name: /Gerar Roteiro Turístico de 2.5h/ }).click();
  const hoursPayload = (await hoursRequest).postDataJSON();
  assert.equal(hoursPayload.mode, 'hours');
  assert.deepEqual(hoursPayload.originCoords, [-23.551, -46.629]);
  await page.getByText('Indisponível no teste de horas', { exact: true }).waitFor();
  await page.unroute('**/api/routes/tourist');
  const hoursEntry = page.locator('input[aria-describedby="tourist-hours-warning"]');
  await hoursEntry.fill('0,2');
  assert.equal(await hoursEntry.inputValue(), '0,2');
  await page.getByText('Quantidade em Horas muito baixa — o trajeto pode ser limitado.', { exact: true }).waitFor();
  await hoursEntry.fill('0,5');
  assert.equal(await page.locator('#tourist-hours-warning').innerText(), '');
  await page.getByRole('button', { name: 'Por Km', exact: true }).click();

  const kmRequest = page.waitForRequest(request => request.url().endsWith('/api/routes/tourist'));
  await page.getByRole('button', { name: /Gerar Roteiro Turístico de 100 km/ }).click();
  const kmPayload = (await kmRequest).postDataJSON();
  assert.equal(kmPayload.mode, 'km');
  assert.deepEqual(kmPayload.originCoords, [-23.551, -46.629]);
  const planner = page.getByRole('dialog', { name: 'Planejamento da viagem' });
  await planner.getByRole('heading', { name: 'Configurar Passeio' }).waitFor();
  await planner.getByRole('heading', { name: 'Clima e pedágios' }).waitFor();
  assert.equal(await planner.getByText(/Percurso por estradas reais/).count(),0,
    'não mostrar a antiga faixa amarela de trânsito e cobertura de pedágios indisponíveis');
  // Move the edge-of-route station clear of the provider attribution on the
  // compact preview. Use a real drag, keeping pointer hit-testing enabled.
  const preview=planner.locator('.maplibregl-canvas, .leaflet-container').first();
  await preview.scrollIntoViewIfNeeded();
  const previewBox=await preview.boundingBox();assert.ok(previewBox);
  await page.mouse.move(previewBox.x+previewBox.width*.75,previewBox.y+previewBox.height*.55);
  await page.mouse.down();
  await page.mouse.move(previewBox.x+previewBox.width*.75,previewBox.y+previewBox.height*.55-60,{steps:10});
  await page.waitForTimeout(200); // Stop drag velocity before release; no inertial overshoot.
  await page.mouse.up();
  const fuelMarker = page.locator('.role-poi-marker[data-poi-category="fuel"], .fuel-station-marker').first();
  // Locais comuns só aparecem no zoom de bairro. Aproximar com o gesto real,
  // como um usuário faria antes de tocar em um posto na prévia do trajeto.
  const nativePreview=planner.locator('[data-map-engine="maplibre-standalone"]').first();
  if(await nativePreview.count() && await fuelMarker.getAttribute('data-poi-category')==='fuel'){
    for(let attempt=0;attempt<10 && !await fuelMarker.isVisible();attempt++){
      const view=await preview.boundingBox();assert.ok(view);
      await page.mouse.move(view.x+view.width*.5,view.y+view.height*.5);
      await page.mouse.wheel(0,-480);
      await page.waitForTimeout(250);
    }
  }
  // A atribuição MapLibre varia de tamanho conforme a plataforma e os tiles.
  // Afaste o marcador dela com gestos reais até o botão receber toques;
  // não use force:true, que esconderia problemas reais de hit-testing.
  const tapFuelMarker=async(name:string)=>{
    // Both renderers use compact pins; prices and comments live in the sheet.
    for(let attempt=0;attempt<4;attempt++){
      try { await fuelMarker.click({trial:true,timeout:1200});break; }
      catch {
        const view=await preview.boundingBox();assert.ok(view);
        await page.mouse.move(view.x+view.width*.48,view.y+view.height*.7);
        await page.mouse.down();
        await page.mouse.move(view.x+view.width*.33,view.y+view.height*.28,{steps:12});
        await page.mouse.up();
      }
    }
    await fuelMarker.click();
    if(name.startsWith('Comentários')){
      const sheet=page.getByRole('dialog',{name:'Preços do posto'});
      await sheet.getByRole('button',{name:'Comentários',exact:true}).click();
    }
  };
  await tapFuelMarker('Comentários de Posto de teste de interface');
  const station = page.getByRole('dialog', { name: 'Preços do posto' });
  await station.getByRole('heading', { name: 'Comentários do posto', exact: true }).waitFor();
  await station.getByRole('button', { name: 'Fechar posto', exact: true }).click();
  await tapFuelMarker('Sugerir preço');
  await station.getByText('Ainda não há preços informados para este posto.').waitFor();
  await station.getByRole('button', { name: 'Sugerir preço', exact: true }).click();
  await station.getByLabel('Preço 1', { exact: true }).fill('5,899');
  await station.getByRole('button', { name: 'Revisar preços' }).click();
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM prices').get() as any).count, 0);
  await station.getByRole('button', { name: 'Confirmar e enviar para análise' }).click();
  await station.getByText(/Preços enviados para análise/).waitFor();
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM prices WHERE status='published'").get() as any).count, 0);
  await station.getByRole('button', { name: 'Enviar foto dos preços', exact: true }).click();
  const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="400"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans" font-size="52" fill="black"><text x="35" y="100">POSTO DE TESTE</text><text x="35" y="210">GASOLINA 5,899</text><text x="35" y="320">ETANOL 3,799</text></g></svg>')).jpeg().toBuffer();
  await station.locator('input[type=file]:not([capture])').setInputFiles({ name: 'placa.jpg', mimeType: 'image/jpeg', buffer: image });
  await station.getByRole('checkbox', { name: /Confirmo que a foto corresponde/ }).check();
  await station.getByRole('button', { name: 'Enviar para análise', exact: true }).click();
  await station.getByText('Foto enviada para análise', { exact: true }).waitFor();
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM prices').get() as any).count, 1);
  const photoId = (db.prepare('SELECT id FROM photos').get() as any).id;
  assert.equal((await fetch(`http://127.0.0.1:3001/api/photos/${photoId}`)).status, 404);
  await page.screenshot({ path: 'test-results/fuel-mobile.png' });

  const administrator = await fetch('http://127.0.0.1:3001/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Admin de teste', email: 'admin-ui@example.test', password: 'admin-ui-test-password' }) });
  const registered = await administrator.json() as any;
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(registered.user.id);
  await adminPage.route(/^https:\/\//, route => route.abort());
  await adminPage.goto('http://127.0.0.1:3000/admin');
  await adminPage.getByRole('button', { name: 'Entrar como administrador', exact: true }).click();
  const adminAccount = adminPage.getByRole('dialog', { name: 'Conta do viajante', exact: true });
  await adminAccount.getByLabel('E-mail', { exact: true }).fill('admin-ui@example.test');
  await adminAccount.getByLabel('Senha', { exact: true }).fill('admin-ui-test-password');
  await adminAccount.getByRole('button', { name: 'Entrar', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Cadastro de locais', exact: true }).waitFor();
  await adminPage.getByRole('button', { name: 'Configurações', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Alterar senha', exact: true }).waitFor();
  await adminPage.getByRole('heading', { name: 'Alterar e-mail', exact: true }).waitFor();
  await adminPage.getByRole('button', { name: 'Salvar novo e-mail', exact: true }).waitFor();
  await adminPage.getByRole('button', { name: 'Salvar nova senha', exact: true }).waitFor();
  await adminPage.getByRole('button', { name: 'Solicitações', exact: true }).click();

  const photoCard = adminPage.locator('article').filter({ has: adminPage.getByRole('heading', { name: 'Posto de teste de interface', exact: true }) });
  assert.equal(await photoCard.getByLabel('Preço 1', { exact: true }).inputValue(), '');
  assert.equal(await photoCard.getByLabel('Preço 3', { exact: true }).inputValue(), '');
  await photoCard.getByLabel('Preço 3', { exact: true }).fill('3,799');
  await photoCard.getByRole('checkbox', { name: /Conferi os valores/ }).check();
  await adminPage.screenshot({ path: 'test-results/admin-manual.png', fullPage: true });
  await photoCard.getByRole('button', { name: 'Aprovar e publicar', exact: true }).click();
  await photoCard.waitFor({ state: 'hidden' });
  const manual = adminPage.locator('article').filter({ has: adminPage.getByRole('button', { name: 'Rejeitar valor de Gasolina comum', exact: true }) });
  await manual.getByRole('checkbox', { name: /Conferi os valores/ }).check();
  await manual.getByRole('button', { name: 'Aprovar e publicar', exact: true }).click();
  await manual.waitFor({ state: 'hidden' });
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM prices WHERE status='published'").get() as any).count, 2);
  assert.equal((await fetch(`http://127.0.0.1:3001/api/photos/${photoId}`)).status, 200);
  await station.getByRole('button', { name: 'Fechar posto' }).click();
  await tapFuelMarker('Sugerir preço');
  await station.getByText('Informação recente · revisada pelo administrador').first().waitFor();
  await station.getByRole('button', { name: 'Fechar posto' }).click();
  await planner.getByRole('button', { name: 'Encontrar combustível mais barato' }).click();
  await planner.getByLabel('Restante no tanque (L)').fill('5');
  await planner.getByLabel('Quanto abastecer (L)').fill('5');
  await planner.getByLabel('Consumo neste combustível (km/L)').fill('20');
  await planner.getByRole('button', { name: 'Comparar postos na rota' }).click();
  await planner.getByText('Menor custo entre os postos comparados').waitFor();
  await planner.getByRole('button', { name: 'Usar preço no cálculo da viagem' }).click();
  assert.equal(await planner.getByLabel('Preço de planejamento').inputValue(), '5.899');
  await planner.getByRole('button', { name: 'Salvar', exact: true }).click();
  await planner.waitFor({ state: 'hidden' });
  const trips = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me');
    const authData = await response.json();
    return JSON.parse(localStorage.getItem('rdv_private_v2_' + authData.user.id + '_trips') || '[]');
  });
  const saved = trips.find((trip: any) => trip.fuelPriceSource?.stationId === 'osm:node:123');
  assert.ok(saved.distanceKm > 0); assert.equal(saved.routingSource, 'OSRM'); assert.equal(saved.isCircular, true); assert.equal(saved.fuelPricePerLiter, 5.899);
  // O Figma abre em Concluídas por padrão; a rota recém-salva aparece em Planejadas.
  await page.getByRole('region',{name:'Minhas viagens'})
    .getByRole('button',{name:'Planejadas'}).click();
  await page.getByRole('button', { name: 'Comboio', exact: true }).first().click();
  await page.getByRole('status').getByText(/Comboio conectado · atualizações automáticas/).waitFor();
  await page.getByRole('button', { name: 'Compartilhar Localização', exact: true }).click();
  await page.getByRole('button', { name: 'Localização ativa', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Localização ativa', exact: true }).click();
  await page.getByRole('button', { name: 'Compartilhar Localização', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Encerrar Comboio', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, Encerrar', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Cadastro', exact: true }).click();
  const manualPlace = adminPage.getByRole('form', { name: 'Cadastrar local', exact: true });
  await manualPlace.getByLabel('Tipo de local', { exact: true }).selectOption('waterfall');
  await manualPlace.getByLabel('Nome do local', { exact: true }).fill('Cachoeira cadastrada no painel');
  await manualPlace.getByLabel('Endereço ou acesso', { exact: true }).fill('Estrada de teste, São Paulo/SP');
  await manualPlace.getByLabel('Latitude', { exact: true }).fill('-23.586');
  await manualPlace.getByLabel('Longitude', { exact: true }).fill('-46.630');
  await manualPlace.getByRole('checkbox').check();
  await manualPlace.getByRole('button', { name: 'Cadastrar e publicar no mapa', exact: true }).click();
  await adminPage.getByText('Local cadastrado e publicado no mapa.', { exact: true }).waitFor();
  const waterfall = db.prepare("SELECT id FROM stations WHERE kind='waterfall'").get() as any;
  assert.ok(waterfall?.id.startsWith('admin:'));
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.screenshot({ path: 'test-results/admin-cadastro-mobile.png', fullPage: true });
  assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await adminPage.setViewportSize({ width: 1365, height: 900 });
  const categoryEditor = adminPage.getByRole('region', { name: 'Editar Cachoeira cadastrada no painel', exact: true });
  await categoryEditor.getByLabel('Categoria do local', { exact: true }).selectOption('viewpoint');
  await categoryEditor.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
  await categoryEditor.getByText('Dados salvos.', { exact: true }).waitFor();
  assert.equal((db.prepare('SELECT kind FROM stations WHERE id=?').get(waterfall.id) as any).kind, 'viewpoint');
  await categoryEditor.getByRole('button', { name: 'Fechar edição', exact: true }).click();
  const revisedCategoryRow = adminPage.getByRole('row').filter({ hasText: 'Cachoeira cadastrada no painel' });
  await revisedCategoryRow.getByRole('cell', { name: 'Mirante', exact: true }).waitFor();
  await revisedCategoryRow.getByRole('button', { name: 'Editar', exact: true }).click();
  assert.equal(await categoryEditor.getByLabel('Categoria do local', { exact: true }).evaluate((element: HTMLSelectElement) => element.value), 'viewpoint');
  await adminPage.getByRole('button', { name: 'Fechar edição', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Importar do OpenStreetMap', exact: true }).click();
  await adminPage.getByLabel('Link do estabelecimento no OpenStreetMap').fill('https://www.openstreetmap.org/node/456');
  await adminPage.getByRole('button', { name: 'Verificar e cadastrar', exact: true }).click();
  await adminPage.getByLabel('Nome', { exact: true }).fill('Restaurante revisado pela administração');
  await adminPage.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
  await adminPage.getByText('Dados salvos.', { exact: true }).waitFor();
  await page.goto('http://127.0.0.1:3000');
  if(!(await page.getByRole('button',{name:'Abrir menu'}).count())) await page.getByRole('button',{name:'Aba Perfil'}).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const gpsControl = page.getByRole('button', { name: 'Centralizar mapa na minha localização' });
  const reportControl = page.getByRole('button', { name: 'Reportar problema na estrada' });
  await gpsControl.waitFor();
  await reportControl.waitFor();
  const gpsRect = await gpsControl.boundingBox();
  const reportRect = await reportControl.boundingBox();
  assert.ok(gpsRect && reportRect && gpsRect.y + gpsRect.height <= reportRect.y + 1, 'GPS precisa ficar acima do alerta');
  assert.ok(gpsRect.width>=56&&reportRect.width>=56);
  assert.equal(await page.getByRole('status',{name:/Velocímetro/}).count(),0);
  await reportControl.click();
  const reportMenu = page.getByRole('menu', { name: 'Escolher ocorrência' });
  const menuBounds=await reportMenu.boundingBox();
  assert.ok(menuBounds&&menuBounds.y<100,'Ícones de alerta continuam no topo do telefone');
  const menuAnimation=await reportMenu.evaluate(el=>getComputedStyle(el).animationName);
  assert.ok(menuAnimation.includes('rdv-alert-drop-down'));
  await reportMenu.getByRole('menuitem', { name: 'Buraco na pista' }).waitFor();
  await reportMenu.getByRole('menuitem', { name: 'Pedágio' }).waitFor();
  await reportMenu.getByRole('menuitem', { name: 'Radar de velocidade' }).waitFor();
  await reportMenu.getByRole('menuitem', { name: 'Buraco na pista' }).click();
  const reportDialog = page.getByRole('dialog', { name: 'Reportar ocorrência na via' });
  await reportDialog.getByText(/Pare em segurança/).waitFor();
  await reportDialog.getByRole('heading',{name:'Deseja fazer o alerta?'}).waitFor();
  await reportDialog.getByRole('button',{name:'Deslize para alertar'}).waitFor();
  assert.equal(await reportDialog.locator('textarea').count(),0);
  await reportDialog.getByRole('button', { name: 'Fechar ocorrência' }).click();
  const expandMapPanel = page.getByRole('button', { name: 'Expandir painel do mapa' });
  const mapPanel = page.getByTestId('map-explore-sheet');
  const initialMapBounds = await mapPanel.boundingBox();
  assert.ok(initialMapBounds && initialMapBounds.height >= 220 && initialMapBounds.height < 300,
    'O painel recolhido deve mostrar a busca e a faixa de endereços salvos');
  await page.getByRole('region',{name:'Explorar destinos e estabelecimentos'})
    .getByRole('button',{name:'Salvar endereço'}).waitFor();
  const grab = await expandMapPanel.boundingBox();
  assert.ok(grab, 'O puxador do painel precisa estar visível');
  await page.mouse.move(grab!.x+grab!.width/2,grab!.y+grab!.height/2);
  await page.mouse.down();
  await page.mouse.move(grab!.x+grab!.width/2,grab!.y-110,{steps:6});
  await page.waitForFunction(height=>{
    const sheet=document.querySelector('[data-testid="map-explore-sheet"]')?.getBoundingClientRect();
    return !!sheet&&sheet.height>height+70;
  },initialMapBounds.height);
  // Compare both rectangles in the same animation frame. Separate browser
  // round trips can sample the entering screen at two different positions.
  const dragging=await page.evaluate(()=>{
    const sheet=document.querySelector('[data-testid="map-explore-sheet"]')!.getBoundingClientRect();
    const viewport=document.querySelector('.rdv-flat-map')!.getBoundingClientRect();
    return {height:sheet.height,bottomDelta:sheet.bottom-viewport.bottom};
  });
  assert.ok(Math.abs(dragging.bottomDelta)<2,
    `Enquanto o usuário arrasta, o painel do Mapa não pode se soltar do rodapé (${dragging.bottomDelta}px)`);
  assert.ok(dragging.height>initialMapBounds.height+70,
    'O painel do Mapa precisa acompanhar o dedo crescendo para cima');
  await page.mouse.up();
  await page.getByRole('button', { name: 'Recolher painel do mapa' }).waitFor();
  await page.waitForFunction(()=>{
    const sheet=document.querySelector('[data-testid="map-explore-sheet"]')?.getBoundingClientRect();
    const viewport=document.querySelector('.rdv-flat-map')?.getBoundingClientRect();
    return !!sheet&&!!viewport&&Math.abs(sheet.bottom-viewport.bottom)<2 &&
      sheet.height>=window.innerHeight*0.6 && sheet.y-viewport.top>=220;
  });
  const expandedMapBounds = await mapPanel.boundingBox();
  assert.ok(expandedMapBounds && expandedMapBounds.y < 0.45 * 844,
    'O painel Mapa deve exibir mais conteúdo sem esconder toda a área de navegação');
  assert.equal(await page.locator('[data-map-panel-scroll]').evaluate(el=>getComputedStyle(el).overflowY),'auto',
    'A lista interna do Mapa continua rolável após expandir');
  await page.getByRole('button', { name: 'Recolher painel do mapa' }).click();
  await expandMapPanel.click();
  const exploration = page.getByRole('region', { name: 'Explorar destinos e estabelecimentos' });
  await exploration.getByRole('heading', { name: 'Viagens sugeridas' }).waitFor();
  await exploration.getByRole('heading', { name: 'Estabelecimentos no mapa' }).waitFor();
  await page.getByRole('button', { name: 'Recolher painel do mapa' }).click();
  // Na aba Mapa, a barra e um campo real: foco imediato, Enter e rotas automaticas.
  const bottomMapSearch = page.getByRole('searchbox', { name: 'Para onde quer ir?' });
  await bottomMapSearch.click();
  assert.equal(await bottomMapSearch.evaluate(element=>document.activeElement===element),true,
    'Tocar na busca do Mapa deve focar o input para abrir o teclado');
  assert.equal(await page.getByRole('dialog', { name: 'Buscar destino no mapa' }).count(),0,
    'A barra do Mapa nao deve abrir outro modal');
  await bottomMapSearch.fill('Parada');
  // Photon pode ordenar Alfa/Beta diferentemente quando há um ponto GPS de viés.
  // Verifica o destino que o próprio serviço retornou, não a posição fixa de uma fixture.
  const mapLocationsRequest=page.waitForResponse(response => {
    const url=new URL(response.url());
    return url.pathname==='/api/locations/search' && url.searchParams.get('q')==='Parada';
  });
  const mapRoutesRequest=page.waitForResponse(response =>
    response.url().endsWith('/api/routes/alternatives') && response.request().method()==='POST');
  await bottomMapSearch.press('Enter');
  const locationsResponse=await mapLocationsRequest;
  assert.equal(locationsResponse.status(),200,'Enter na aba Mapa deve consultar o destino');
  const locationsData=await locationsResponse.json() as {results: Array<{name:string;coords?:[number,number]}>};
  const expectedDestination=locationsData.results.find(result=>
    result.coords?.length===2 && result.coords.every(Number.isFinite));
  assert.ok(expectedDestination,'A busca de teste precisa retornar um destino geocodificado');
  const mapDestination = page.getByRole('region',{name:'Destino no mapa'});
  await mapDestination.getByRole('heading',{name:expectedDestination.name,exact:true}).waitFor();
  // Falhas futuras incluem diagnóstico do painel (por exemplo, GPS sem permissão).
  const mapRouteResponse=await mapRoutesRequest.catch(async failure => {
    const panel=await mapDestination.innerText().catch(()=>'(painel não disponível)');
    throw new Error(`Rota não requisitada após Enter na aba Mapa: ${String(failure)}. Painel: ${panel.slice(0,1200)}`);
  });
  assert.equal(mapRouteResponse.status(),200,'Enter na aba Mapa deve calcular as rotas');
  await mapDestination.getByText('Rota mais rápida').waitFor();
  // Leaflet SVG is used in raster fallback. In vector mode MapLibre renders
  // lines on WebGL, so inspect the verified GeoJSON feature count instead of
  // accidentally passing because an empty canvas happens to exist.
  await page.waitForFunction(()=>{
    const rasterPaths=document.querySelectorAll('.leaflet-overlay-pane path').length;
    const map=document.querySelector('[data-role-vector-routes]');
    const vectorFeatures=Number(map?.getAttribute('data-role-vector-routes')||0);
    return rasterPaths>0 || vectorFeatures>0;
  },undefined,{timeout:10000});
  await mapDestination.getByRole('button',{name:'Sair da visualização do destino'}).click();
  // Places are intentionally hidden below zoom 14. Selecting a verified
  // establishment from the map sheet is the real user action that focuses
  // its coordinates at neighborhood zoom. Wheel-scrolling the canvas does
  // not guarantee this threshold or center on the intended marker.
  await page.getByRole('button',{name:'Expandir painel do mapa'}).click();
  const establishmentsSection=page.getByRole('heading',{name:'Estabelecimentos no mapa'})
    .locator('xpath=../..');
  await establishmentsSection.getByRole('button',{name:/Restaurante revisado pela administração/}).click();
  const nativeMap=page.locator('[data-map-engine="maplibre-standalone"]:visible').first();
  const restaurantPin=(await nativeMap.count()?nativeMap:page)
    .locator('.managed-place-marker[aria-label="Ver Restaurante revisado pela administração"]').first();
  if(await nativeMap.count())await page.waitForFunction(()=>{
    const map=document.querySelector('[data-map-engine="maplibre-standalone"]');
    return Number((map as HTMLElement)?.dataset.mapZoom)>=14;
  },undefined,{timeout:10000});
  await restaurantPin.waitFor({state:'visible',timeout:10000});
  await restaurantPin.focus();
  assert.equal(await restaurantPin.evaluate(el=>document.activeElement===el),true,
    'O marcador visível deve ser acessível pelo teclado');
  await restaurantPin.press('Enter');
  const restaurant = page.getByRole('dialog', { name: 'Estabelecimento', exact: true });
  await restaurant.getByRole('heading', { name: /Restaurante revisado pela administração/ }).waitFor();
  await restaurant.getByLabel('Seu comentário', { exact: true }).fill('Comentário de teste da interface.');
  await restaurant.getByRole('button', { name: 'Enviar comentário para análise', exact: true }).click();
  await restaurant.getByText('Comentário enviado para análise.', { exact: true }).waitFor();
  await adminPage.getByRole('button', { name: 'Solicitações', exact: true }).click();
  await adminPage.getByRole('button', { name: /^Comentários \(/ }).click();
  await adminPage.getByRole('button', { name: 'Aprovar comentário', exact: true }).click();
  await adminPage.getByText('Publicado', { exact: false }).waitFor();
  await adminPage.getByRole('button', { name: 'Excluir comentário', exact: true }).click();
  await adminPage.getByRole('dialog', { name: 'Excluir comentário', exact: true }).getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await adminPage.getByText('Nenhum registro nesta seção.', { exact: true }).waitFor();
  const disposable = await fetch('http://127.0.0.1:3001/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Usuário descartável', email: 'remove-ui@example.test', password: 'remove-ui-test-password' }) });
  assert.equal(disposable.status, 201);
  await adminPage.getByRole('button', { name: 'Usuários', exact: true }).click();
  await adminPage.getByRole('row').filter({ hasText: 'Usuário descartável' }).getByRole('button', { name: 'Excluir usuário', exact: true }).click();
  await adminPage.getByRole('dialog', { name: 'Excluir usuário', exact: true }).getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await adminPage.getByText(/Conta excluída/).waitFor();
  assert.ok((db.prepare("SELECT deleted_at FROM users WHERE display_name='Usuário excluído'").get() as any).deleted_at);
  await restaurant.getByRole('button', { name: 'Fechar estabelecimento', exact: true }).click();
  if(!(await page.getByRole('button',{name:'Abrir menu'}).count())) await page.getByRole('button',{name:'Aba Perfil'}).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Início', exact: true }).click();
  await page.getByRole('button', { name: 'Mais opções de planejamento', exact: true }).click();
  await page.getByRole('button', { name: 'Origem e destino', exact: true }).click();
  // Clear the incomplete manual draft if Home stayed mounted.
  while (await page.getByRole('button', { name: 'Remover parada 1', exact: true }).count()) await page.getByRole('button', { name: 'Remover parada 1', exact: true }).click();
  await page.getByLabel('Destino', { exact: true }).fill('Teste parada');
  await page.getByRole('button', { name: 'Buscar destino', exact: true }).click();
  await page.getByRole('button', { name: /^Parada Alfa de teste/ }).click();
  await page.getByRole('button', { name: '+ Adicionar parada', exact: true }).click();
  await page.getByLabel('Parada 1', { exact: true }).fill('Teste parada');
  await page.getByRole('button', { name: 'Buscar parada 1', exact: true }).click();
  await page.getByRole('button', { name: /^Parada Alfa de teste/ }).click();
  await page.getByLabel('Permanência na parada 1', { exact: true }).fill('5');
  await page.getByRole('button', { name: '+ Adicionar parada', exact: true }).click();
  await page.getByLabel('Parada 2', { exact: true }).fill('Teste parada');
  await page.getByRole('button', { name: 'Buscar parada 2', exact: true }).click();
  await page.getByRole('button', { name: /^Parada Beta de teste/ }).click();
  await page.getByLabel('Permanência na parada 2', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Arrastar parada 1', exact: true }).dragTo(page.getByRole('button', { name: 'Arrastar parada 2', exact: true }));
  assert.equal(await page.getByLabel('Parada 1', { exact: true }).inputValue(), 'Parada Beta de teste');
  await page.screenshot({ path: 'test-results/stops-home-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Usar minha localização', exact: true }).click();
  // O provedor de GPS do Chromium pode expirar no runner mesmo com permissão.
  // Testar o percurso com uma origem pesquisada quando o dispositivo não respondeu.
  await page.getByRole('button', { name: 'Usar minha localização', exact: true }).waitFor({state:'visible',timeout:25000});
  if (!(await page.getByText(/Origem: Sua Localização/).count())) {
    await page.getByLabel('Origem', {exact:true}).fill('Parada');
    await page.getByRole('button',{name:'Buscar origem',exact:true}).click();
    await page.getByRole('button',{name:/Parada Beta de teste/}).first().click();
  }
  await page.getByRole('button', { name: /Traçar Rota até/ }).click();
  await planner.getByText(/1\. Parada Beta de teste/).last().waitFor();
  await planner.getByRole('button', { name: 'Salvar', exact: true }).waitFor();
  await planner.getByRole('button', { name: 'Remover parada 1', exact: true }).click();
  await planner.getByText(/1\. Parada Alfa de teste/).last().waitFor();
  await planner.getByRole('button', { name: '+ Adicionar parada', exact: true }).click();
  await planner.getByLabel('Parada 2', { exact: true }).fill('Teste parada');
  await planner.getByRole('button', { name: 'Buscar parada 2', exact: true }).click();
  await planner.getByRole('button', { name: /^Parada Beta de teste/ }).click();
  await planner.getByLabel('Permanência na parada 2', { exact: true }).fill('10');
  await planner.getByText(/2\. Parada Beta de teste/).last().waitFor();
  await planner.getByLabel('Preço de planejamento', { exact: true }).fill('5.899');
  await planner.getByRole('button', { name: 'Compartilhar', exact: true }).click();
  const sharing = page.getByRole('dialog', { name: 'Compartilhar viagem', exact: true });
  await sharing.getByRole('button', { name: /Compartilhar Rota/ }).click();
  await sharing.getByRole('button', { name: 'Gerar link do roteiro', exact: true }).click();
  const link = await sharing.getByLabel('Link do roteiro', { exact: true }).inputValue();
  const reader = await adminContext.newPage();
  await reader.route('https://**', route => route.abort());
  await reader.goto('http://127.0.0.1:3000');
  await reader.evaluate(link => { window.location.hash = link.split('#')[1]; }, link);
  await reader.getByRole('heading', { name: 'Sequência das paradas', exact: true }).waitFor();
  await reader.getByText('1. Parada Alfa de teste', { exact: true }).last().waitFor();
  // Ao usar a própria Parada Beta como origem manual, o compartilhamento público
  // deve ocultar essa parada porque a opção "Proteger minha origem" está ativa.
  // Sem essa proteção, o teste exporia indiretamente a localização privada.
  await reader.getByText(/^2[.] (Parada Beta de teste|Parada na região de partida)$/).last().waitFor();
  await reader.close();
  await sharing.getByRole('button', { name: 'Fechar compartilhamento', exact: true }).click();
  await planner.getByRole('button', { name: 'Salvar', exact: true }).click();
  await planner.waitFor({ state: 'hidden' });
  const savedStops = await page.evaluate(async () => {
    const authData = await (await fetch('/api/auth/me')).json();
    return JSON.parse(localStorage.getItem('rdv_private_v2_' + authData.user.id + '_trips') || '[]').find((trip: any) => trip.manualStops?.length === 2);
  });
  assert.deepEqual(savedStops.manualStops.map((stop: any) => stop.location.name), ['Parada Alfa de teste', 'Parada Beta de teste']);
  assert.ok(savedStops.distanceKm > 0); assert.ok(savedStops.durationMinutes >= 15); assert.equal(savedStops.tollsStatus, 'unknown');
  assert.ok(savedStops.estimatedFuelCost > 0);
  // A new browser session must restore the same account from the API, not a copied localStorage cache.
  let serverHasLatest = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const snapshot = await page.evaluate(async () => await (await fetch('/api/me/state')).json());
    if (snapshot.state?.trips?.some((trip: any) => trip.manualStops?.length === 2)) {
      serverHasLatest = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(serverHasLatest, 'The latest itinerary must reach the private cloud API before a second device reads it.');
  const preSecond = await page.evaluate(async () => await (await fetch('/api/me/state')).json());
  console.log('SYNC BEFORE SECOND', JSON.stringify({
    revision: preSecond.revision, trips: preSecond.state?.trips?.map((t: any) => [t.id, t.manualStops?.length])
  }));
  const secondDevice = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await secondDevice.addCookies(await context.cookies());
    const secondPage = await secondDevice.newPage();
    await secondPage.route('https://**', route => route.abort());
    await secondPage.goto('http://127.0.0.1:3000');
    await secondPage.getByRole('button',{name:'Aba Perfil'}).click();
    await secondPage.getByRole('button', { name: 'Abrir menu' }).click();
    await secondPage.getByRole('button', { name: 'Minhas viagens', exact: true }).click();
    const restored = await secondPage.evaluate(async () => {
      const response = await fetch('/api/me/state');
      const result = await response.json();
      return result.state;
    });
    const secondDiagnostic = await secondPage.evaluate(async () => {
      const me = await (await fetch('/api/auth/me')).json();
      const state = await (await fetch('/api/me/state')).json();
      return { userId: me.user?.id, revision: state.revision,
        trips: state.state?.trips?.map((trip: any) => [trip.id, trip.manualStops?.length]),
        localKeys: Object.keys(localStorage).filter(key => key.includes('_trips')) };
    });
    console.log('SYNC AFTER SECOND', JSON.stringify(secondDiagnostic));
    assert.equal(restored.vehicles.length, 1);
    assert.ok(restored.trips.some((trip: any) => trip.manualStops?.length === 2));
  } finally { await secondDevice.close(); }
  // Navigation controls preserve the active trip in the menu and can end a planned trip.
  if(!(await page.getByRole('button',{name:'Abrir menu'}).count())) await page.getByRole('button',{name:'Aba Perfil'}).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  // Na tela rodoviaria o zoom esta disponivel por gestos, sem controles + / -.
  assert.equal(await page.locator('.leaflet-control-zoom-out').count(), 0);
  await page.getByRole('button', { name: 'Alterar rota', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Centralizar mapa na minha localização' }).waitFor();
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  // Android Back event replaces the removed bulky header while keeping the trip active.
  await page.evaluate(()=>window.dispatchEvent(new Event('rdv:android-back')));
  const resumeBanner=page.getByRole('complementary',{name:'Viagem em andamento'});
  const resumeNavigation=resumeBanner.getByRole('button',{name:'Retomar navegação',exact:true});
  await resumeNavigation.waitFor();
  const sessionState = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me');
    const me = await response.json();
    const accountId: string | undefined = me.user?.id;
    const activeKeys = Object.keys(localStorage).filter(key => key.startsWith('rdv_private_v2_') && key.endsWith('_active_trip'));
    const activeKey = accountId ? 'rdv_private_v2_' + accountId + '_active_trip' : null;
    const rawTrip = activeKey ? localStorage.getItem(activeKey) : null;
    return { httpStatus: response.status, userId: accountId || null, apiError: me.error || me.message || null,
      activeKeys, hasActiveTrip: !!rawTrip, runningId: rawTrip ? JSON.parse(rawTrip).id : null };
  });
  console.log('NAVIGATION SESSION CHECK', JSON.stringify(sessionState));
  assert.equal(sessionState.httpStatus, 200, 'Auth/me precisa estar acessível após iniciar a navegação');
  assert.ok(sessionState.userId, 'A sessão do viajante não deve desaparecer durante uma viagem');
  assert.ok(sessionState.hasActiveTrip, 'A viagem iniciada precisa continuar no armazenamento da conta');
  const runningId = sessionState.runningId;
  assert.ok(runningId);
  await resumeNavigation.click();
  await page.locator('.rdv-nav-figma-root').getByRole('button', { name: 'Encerrar viagem', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, encerrar', exact: true }).click();
  assert.equal(await resumeBanner.count(),0,'Encerrar a viagem remove a faixa de retomada');
  if(!(await page.getByRole('button',{name:'Abrir menu'}).count())) await page.getByRole('button',{name:'Aba Perfil'}).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar viagem', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, encerrar', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('UI: paradas reais, drag, recálculo, compartilhamento entre dispositivos, envio privado sem OCR, revisão manual no admin, publicação, cadastro real, comentários, exclusão de usuário, comparação, orçamento, circuito e consentimento passaram.');
} catch (error) {
  await page.screenshot({ path: 'test-results/failure.png', fullPage: true }).catch(()=>{});
  await adminPage.screenshot({ path: 'test-results/admin-failure.png', fullPage: true }).catch(()=>{});
  console.error('Admin no erro:', (await adminPage.locator('body').innerText().catch(()=>'' )).slice(-6000));
  console.error('Tela no erro:', (await page.locator('body').innerText().catch(()=>'' )).slice(-6000));
  console.error('Erros JS:', JSON.stringify(errors), 'URL:',page.url());
  throw error;
} finally {
  if (adminBrowser !== browser) await adminBrowser.close();
  await browser.close(); await vite.close();
  await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}

