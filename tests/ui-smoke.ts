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
  if (String(url).includes('/interpreter') && new URLSearchParams(String(options?.body)).get('data')?.includes('node(456)')) return new Response(JSON.stringify({ elements: [{ type: 'node', id: 456, lat: -23.585, lon: -46.629, tags: { amenity: 'restaurant', name: 'Restaurante de teste da interface', 'addr:street': 'Rua de teste' } }] }));
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
const browser = await chromium.launch({ headless: true, executablePath, args: executablePath ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote'] : [] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: -23.551, longitude: -46.629, accuracy: 3 } });
const page = await context.newPage();
const adminBrowser = executablePath ? await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote'] }) : browser;
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
  await page.route('https://**', route => route.abort());
  await page.goto('http://127.0.0.1:3000');
  await page.goto('http://127.0.0.1:3000/admin');
  await page.getByRole('heading', { name: 'Acesso exclusivo do administrador' }).waitFor();
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('heading', {name:'Dar um rolê por aí?'}).waitFor();
  await page.getByRole('button', {name:'Rolê com origem e destino'}).waitFor();
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
  const initialHomeBounds = await homePanel.boundingBox();
  assert.ok(initialHomeBounds && initialHomeBounds.y > 0.56 * 844,
    'O painel Início deve começar mais baixo, deixando a maior parte do mapa visível');
  // Regression: dragging the Home grip must grow the sheet from the BOTTOM;
  // translating the entire sheet up exposed a second map strip below it.
  const homeGrip=page.locator('[data-panel-grip]');
  const homeGripBox=await homeGrip.boundingBox();
  assert.ok(homeGripBox);
  await page.mouse.move(homeGripBox!.x+homeGripBox!.width/2,homeGripBox!.y+homeGripBox!.height/2);
  await page.mouse.down();
  await page.mouse.move(homeGripBox!.x+homeGripBox!.width/2,homeGripBox!.y-145,{steps:9});
  const draggedBox=await homePanel.boundingBox();
  const screenBottom=await page.locator('.rdv-navigation-screen').evaluate(el=>el.getBoundingClientRect().bottom);
  assert.ok(draggedBox && Math.abs(draggedBox.y+draggedBox.height-screenBottom)<2,
    'Durante o gesto o painel deve permanecer ancorado na borda inferior, sem mostrar o mapa embaixo');
  assert.ok(draggedBox.height>initialHomeBounds!.height+110,
    'Puxar para cima deve aumentar a altura do painel, não mover todo o elemento');
  await page.mouse.up();
  await page.waitForFunction(()=>{
    const panel=document.querySelector('[data-testid="home-main-sheet"]')?.getBoundingClientRect();
    const screen=document.querySelector('.rdv-navigation-screen')?.getBoundingClientRect();
    return !!panel&&!!screen&&Math.abs(panel.bottom-screen.bottom)<2&&panel.height>=window.innerHeight*0.8;
  });
  const scrollHome=page.locator('[data-panel-scroll]');
  assert.ok(await scrollHome.evaluate(el=>el.scrollHeight>el.clientHeight),
    'O conteúdo completo do menu deve continuar rolável dentro da folha expandida');
  await scrollHome.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  assert.ok(await scrollHome.evaluate(el=>el.scrollTop>0),'A folha deve permitir visualizar todas as opções');
  await scrollHome.evaluate(el=>{el.scrollTop=0;});
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
    return !!panel&&!!screen&&Math.abs(panel.bottom-screen.bottom)<2&&panel.height<=window.innerHeight*0.65;
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
  const homeReport = page.getByRole('button', {name:'Reportar problema na estrada'});
  await homeGps.waitFor();
  await homeReport.waitFor();
  const homeGpsBox = await homeGps.boundingBox();
  const homeReportBox = await homeReport.boundingBox();
  const speedCircleBox = await page.getByRole('status',{name:'Velocímetro'}).boundingBox();
  const centerY=(bounds:{y:number;height:number})=>bounds.y+bounds.height/2;
  assert.ok(homeGpsBox && homeReportBox && speedCircleBox &&
    Math.abs(centerY(homeGpsBox)-centerY(homeReportBox))<8 &&
    Math.abs(centerY(speedCircleBox)-centerY(homeGpsBox))<16,
    'GPS e reportar devem ficar na mesma altura do velocímetro');
  await homeReport.click();
  const homeReportOptions = page.getByRole('menu', {name:'Escolher ocorrência'});
  await homeReportOptions.getByRole('menuitem', {name:'Buraco na pista'}).waitFor();
  await homeReportOptions.getByRole('menuitem', {name:'Veículo parado / quebrado'}).waitFor();
  await homeReportOptions.getByRole('menuitem', {name:'Pedágio'}).waitFor();
  await homeReportOptions.getByRole('menuitem', {name:'Buraco na pista'}).click();
  const homeReportDialog = page.getByRole('dialog', {name:'Reportar ocorrência na via'});
  await homeReportDialog.getByText(/Pare em segurança/).waitFor();
  assert.equal(await homeReportDialog.getByRole('button', {name:'Enviar para análise'}).isDisabled(), true);
  await homeReportDialog.getByRole('button', {name:'Fechar ocorrência'}).click();
  await page.getByRole('button', {name:'Abrir menu'}).click();
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
  // O cadastro de veículos permanece no Perfil, não na antiga aba inferior.
  await page.getByRole('button', { name: 'Minha Garagem', exact: true }).click();
  await page.getByRole('button', { name: 'Novo Veículo', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar Veículo na Garagem', exact: true }).click();
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
  const choicesRequest = page.waitForResponse(response => response.url().endsWith('/api/routes/alternatives') && response.request().method()==='POST');
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
  await destinationMap.getByRole('button',{name:'Sair da visualização do destino'}).click();
  await page.getByRole('heading',{name:'Dar um rolê por aí?'}).waitFor();
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
  const roadRequest = page.waitForResponse(response => response.url().endsWith('/api/routes/itinerary') && response.request().method() === 'POST');
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
  await planner.getByText(/Percurso por estradas reais/).first().waitFor();
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
  const fuelMarker = page.locator('.fuel-station-marker').first();
  await fuelMarker.getByRole('button', { name: 'Comentários de Posto de teste de interface', exact: true }).click();
  const station = page.getByRole('dialog', { name: 'Preços do posto' });
  await station.getByRole('heading', { name: 'Comentários do posto', exact: true }).waitFor();
  await station.getByRole('button', { name: 'Fechar posto', exact: true }).click();
  await fuelMarker.getByRole('button', { name: 'Sugerir preço', exact: true }).click();
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
  await adminPage.route('https://**', route => route.abort());
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
  await fuelMarker.getByRole('button', { name: 'Sugerir preço', exact: true }).click();
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
  await page.getByRole('button', { name: 'Comboio', exact: true }).first().click();
  await page.getByText(/Comboio sincronizado entre celulares/).waitFor();
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
  await adminPage.getByRole('button', { name: 'Fechar edição', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Importar do OpenStreetMap', exact: true }).click();
  await adminPage.getByLabel('Link do estabelecimento no OpenStreetMap').fill('https://www.openstreetmap.org/node/456');
  await adminPage.getByRole('button', { name: 'Verificar e cadastrar', exact: true }).click();
  await adminPage.getByLabel('Nome', { exact: true }).fill('Restaurante revisado pela administração');
  await adminPage.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
  await adminPage.getByText('Dados salvos.', { exact: true }).waitFor();
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const gpsControl = page.getByRole('button', { name: 'Centralizar mapa na minha localização' });
  const reportControl = page.getByRole('button', { name: 'Reportar problema na estrada' });
  await gpsControl.waitFor();
  await reportControl.waitFor();
  const gpsRect = await gpsControl.boundingBox();
  const reportRect = await reportControl.boundingBox();
  assert.ok(gpsRect && reportRect && gpsRect.y + gpsRect.height <= reportRect.y + 1, 'GPS precisa ficar acima do alerta');
  await reportControl.click();
  const reportMenu = page.getByRole('menu', { name: 'Escolher ocorrência' });
  await reportMenu.getByRole('menuitem', { name: 'Buraco na pista' }).waitFor();
  await reportMenu.getByRole('menuitem', { name: 'Pedágio' }).waitFor();
  await reportMenu.getByRole('menuitem', { name: 'Radar de velocidade' }).waitFor();
  await reportMenu.getByRole('menuitem', { name: 'Buraco na pista' }).click();
  const reportDialog = page.getByRole('dialog', { name: 'Reportar ocorrência na via' });
  await reportDialog.getByText(/Pare em segurança/).waitFor();
  assert.equal(await reportDialog.getByRole('button', { name: 'Enviar para análise' }).isDisabled(), true);
  await reportDialog.getByRole('button', { name: 'Fechar ocorrência' }).click();
  const expandMapPanel = page.getByRole('button', { name: 'Expandir painel do mapa' });
  const mapPanel = page.getByTestId('map-explore-sheet');
  const initialMapBounds = await mapPanel.boundingBox();
  assert.ok(initialMapBounds && initialMapBounds.height < 180,
    'Ao entrar no Mapa, o painel deve ficar recolhido por padrão');
  const grab = await expandMapPanel.boundingBox();
  assert.ok(grab, 'O puxador do painel precisa estar visível');
  await page.mouse.move(grab!.x+grab!.width/2,grab!.y+grab!.height/2);
  await page.mouse.down();
  await page.mouse.move(grab!.x+grab!.width/2,grab!.y-110,{steps:6});
  const draggingBounds=await mapPanel.boundingBox();
  const mapViewportBottom=await page.locator('.rdv-flat-map').first().evaluate(el=>el.getBoundingClientRect().bottom);
  assert.ok(draggingBounds && Math.abs(draggingBounds.y+draggingBounds.height-mapViewportBottom)<2,
    'Enquanto o usuário arrasta, o painel do Mapa não pode se soltar do rodapé');
  assert.ok(draggingBounds.height>initialMapBounds!.height+70,
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
  await page.locator('.managed-place-marker[title="Restaurante revisado pela administração"]').focus();
  await page.locator('.managed-place-marker[title="Restaurante revisado pela administração"]').press('Enter');
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
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  // Na tela rodoviaria o zoom esta disponivel por gestos, sem controles + / -.
  assert.equal(await page.locator('.leaflet-control-zoom-out').count(), 0);
  await page.getByRole('button', { name: 'Alterar rota', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Centralizar mapa na minha localização' }).waitFor();
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar ao menu e manter viagem ativa', exact: true }).click();
  await page.getByRole('button', { name: 'Retomar mapa', exact: true }).waitFor();
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
  await page.getByRole('button', { name: 'Retomar mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar viagem', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, encerrar', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Retomar mapa', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar viagem', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, encerrar', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('UI: paradas reais, drag, recálculo, compartilhamento entre dispositivos, envio privado sem OCR, revisão manual no admin, publicação, cadastro real, comentários, exclusão de usuário, comparação, orçamento, circuito e consentimento passaram.');
} catch (error) {
  await page.screenshot({ path: 'test-results/failure.png', fullPage: true });
  await adminPage.screenshot({ path: 'test-results/admin-failure.png', fullPage: true });
  console.error('Admin no erro:', (await adminPage.locator('body').innerText()).slice(-6000));
  console.error('Tela no erro:', (await page.locator('body').innerText()).slice(-6000));
  console.error('Erros JS:', JSON.stringify(errors), 'URL:',page.url());
  throw error;
} finally {
  if (adminBrowser !== browser) await adminBrowser.close();
  await browser.close(); await vite.close();
  await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}

