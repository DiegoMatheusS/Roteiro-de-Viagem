# Testar mapa, alertas e cálculo de rotas (aplicativo público)

## Provedores usados agora

- **Mapa:** Leaflet + tiles OpenStreetMap/CARTO (sem chave do Google Maps).
- **Busca de lugares:** API do backend -> Photon; variável `GEOCODING_URL`.
- **Trajeto rodoviário:** API do backend -> OSRM; variável `ROUTING_URL`. Usa geometria viária, distância e duração estimada; **não informa trânsito ao vivo**.
- **Postos e lugares turísticos:** backend com dados do OpenStreetMap/Overpass e cadastros aprovados.
- **Alertas:** `POST /api/road-alerts`, `POST /api/road-alerts/route` e `POST /api/road-alerts/:id/confirm`; registros novos passam por moderação. O voto exige login e GPS recente a até 700 m. Três confirmações negativas independentes (ao menos duas vezes as positivas) retiram um marcador ativo. O autor não pode votar no próprio relato.

## Conectar e validar a API

1. No **Railway** (`roteiro-api`), confirme `DATABASE_PATH=/app/data/...` com volume persistente montado em `/app/data`. Mantenha `TRUST_PROXY_HOPS=1`.
2. Para **testes**, o roteador padrão é `https://router.project-osrm.org` e a busca padrão é `https://photon.komoot.io`. São serviços públicos de demonstração, sujeitos a limites; para uso real configure `ROUTING_URL` e `GEOCODING_URL` com provedores compatíveis que você controle. As variáveis são do **backend**, não do frontend.
3. No **Cloudflare Pages**, vincule o projeto público ao GitHub, com build `npm run build` e saída `dist`. O Worker de `/api/*` deve usar `RDV_BACKEND_ORIGIN` apontando ao Railway e o mesmo segredo `WEB_PROXY_SECRET` no Pages e Railway.
4. No Railway, configure `PUBLIC_APP_URL` com a origem do Pages, sem barra final. **Não** exponha `WEB_PROXY_SECRET` nem outras chaves como variáveis `VITE_*`.
5. Teste `https://roteiro-afx.pages.dev/api/health` e o endpoint de saúde direto no Railway: ambos devem retornar `{"ok":true}`. Se apenas o Railway responder, verifique Worker, origem e segredo do proxy no Cloudflare.
6. Entre no aplicativo, permita GPS, pesquise um destino real e pressione Enter. Confirme que a prévia no mapa desenha as ruas, informa km e duração e oferece alternativas. Teste também origem/destino na aba Mapa. Com o GPS impreciso ou serviço OSRM indisponível, o aplicativo deve mostrar o erro, não uma reta fictícia.
7. Com o carro parado, toque no triângulo de alertas: deve abrir o balão de 8 ícones. Envie um alerta de teste; aprove-o na administração separada. Toque no marcador na rota e confirme **Sim** ou **Não**. Use contas diferentes e GPS próximo para testar a retirada, sem remover alertas reais indevidamente.

## Diagnóstico local

```bash
npm ci
npm run lint
npm test
npm run test:ui
npm run build
```

Se a intenção for trocar para **Google Maps Platform / Routes API**, será preciso escolher os produtos do Google Cloud, habilitar faturamento e guardar a chave do serviço apenas no backend. Não há chave Google Maps necessária para os testes com Leaflet + OSRM atuais.
