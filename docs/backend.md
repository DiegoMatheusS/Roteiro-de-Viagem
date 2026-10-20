# Backend HTTPS para o Android

O repositório inclui um Dockerfile e `railway.json`. O serviço serve frontend e API juntos e aceita a porta `PORT` da hospedagem. A API usa SQLite; configure **uma réplica** e um volume persistente em `/app/data`, gravável pelo usuário `node` (UID 1000). Não use o disco temporário do container para contas ou fotografias.

Origem configurada para o aplicativo: `https://roteiro-api-production.up.railway.app`. O entrypoint ajusta o proprietário da pasta do volume e imediatamente troca para o usuário `node`; a API e o npm rodam com UID 1000. A validação em container usa um volume novo sem preparação manual e confere o UID e a persistência após reinício.

Variáveis:

- `NODE_ENV=production` (já definida no container).
- `DATABASE_PATH=/app/data/roteiro.sqlite` (já definida no container).
- `PUBLIC_APP_URL=https://dominio-real-do-servico`, a mesma origem usada pelo app.
- `PORT`, fornecida pela hospedagem; localmente, `API_PORT=3001`.
- `TRUST_PROXY_HOPS=1` no Railway para aplicar os limites ao IP encaminhado pelo proxy. Deixe ausente ao acessar a API diretamente, sem proxy.
- Provedores reais de roteamento, geocodificação e previsão conforme `.env.example` e as condições dos serviços.

Após publicar, confira `/api/health`, cadastro/login e uma contribuição. Preserve e faça backup do volume; teste a recuperação antes da distribuição pública. Para abrir o painel administrativo, cadastre sua conta e promova explicitamente o usuário pelo comando descrito no README.

O workflow **Validar servidor em container** compila a imagem, consulta a API e o frontend, cadastra uma conta de teste e comprova o login após reiniciar o container com o mesmo volume. Os dados são isolados e removidos ao terminar o teste.

No Railway, crie um projeto do Roteiro de Viagem, conecte este repositório na branch `main`, adicione o volume e o domínio HTTPS. Não reaproveite banco ou serviço de outro projeto. O arquivo `railway.json` aplica healthcheck e uma réplica. Confirme a permissão de escrita do volume para UID 1000 antes de cadastrar contas. Depois use essa origem em `RDV_API_URL` para gerar o APK conectado.

## Base própria de locais e rotas

O SQLite no volume permanente do Railway já contém `stations` (estabelecimentos),
`locations` (lugares verificáveis do OpenStreetMap/Photon), `geocoding_queries` (cache
de buscas externas) e `traveler_states` (roteiros, perfil e endereço residencial
privados do viajante). O aplicativo consulta primeiro as tabelas locais de locais
e estabelecimentos, e só usa Photon quando precisa de resultados adicionais.

Uma busca não transforma o texto digitado em um endereço confirmado. Somente locais
identificados pelo OpenStreetMap/Photon ou cadastrados e revisados são considerados
pontos reais. Pontos turísticos descobertos também alimentam `locations`, com
identificador OSM para evitar duplicidades e com atribuição à fonte. Os dados têm
data de atualização, pois um estabelecimento pode fechar ou mudar de endereço.

`user_saved_locations` armazena apenas locais que o viajante **selecionou**
explicitamente na busca, com limite de 50 por conta. Não há captura de teclas,
gravação contínua de GPS nem publicação do endereço residencial em buscas públicas.
`GET /api/me/locations` recupera os dados privados e `DELETE /api/me/locations`
permite apagá-los. Somente o usuário autenticado pode consultar ou excluir os
próprios locais. O endereço de casa que o usuário preencher no perfil permanece
no snapshot privativo `traveler_states`; ele não alimenta o catálogo público.

`user_route_cache` armazena trajetos OSRM exatos **por conta**, incluindo pontos
de GPS potencialmente sensíveis. Uma rota reutilizada em até 24 horas não precisa de
nova chamada. Se o serviço externo falhar, rotas de até 48 horas podem ser
recuperadas com aviso explícito de que estão desatualizadas. Resultados muito
grandes não são colocados em cache; há limite de 18 trajetos por usuário,
400 registros globalmente e limpeza por prazo. Falhas ao gravar o cache não
interrompem um cálculo rodoviário bem-sucedido. Novas rotas ainda exigem um motor de roteamento OSRM; cache
**não equivale a um mapa ou roteador autônomo** nem fornece tráfego/obras ao vivo.

É necessário manter backups e isolamento de contas; o arquivo SQLite contém
dados pessoais. Não usar endereços privados para treinar recomendações globais
sem consentimento específico. Para eliminar de fato a dependência de terceiros em
escala, será necessário hospedar dados OSM e um serviço próprio de geocodificação e
roteamento, respeitando os termos e atribuição de dados do OSM e provedores.


## Catálogo regional de turismo (OpenStreetMap)

O Rolê suporta importação de **locais reais** em 31 regiões do Brasil:
parques, reservas naturais, cachoeiras, museus, galerias, teatros,
monumentos, praias, mirantes e **estradas marcadas como cênicas** no OSM.
A região é uma área de busca de aproximadamente 35 km ao redor de cada centro;
**não representa um cadastro completo do município, estado ou Brasil**.
A presença no OSM não garante acesso de carro/moto, abertura ou segurança:
sempre confira condições de acesso, horários e sinalização.

Para carregar uma região, com o backend parado ou em um banco de preparação:

```bash
npm ci
npm run tourism:import -- --region=sao-paulo --db=./data/roteiro.sqlite
npm run tourism:import -- --region=rio-de-janeiro --db=./data/roteiro.sqlite
npm run tourism:import -- --region=serra-gaucha --db=./data/roteiro.sqlite
```

`npm run tourism:import` sem parâmetros lista as regiões suportadas.
Também é possível usar `--db=/caminho/roteiro.sqlite` para **um banco separado**
de preparação, sem tocar na produção. Os scripts não se conectam ao Railway
nem ao Cloudflare automaticamente. **Não substitua o SQLite de produção por
esse banco local**, porque ele não contém usuários nem viagens existentes.
Depois da normalização do Railway, execute a importação no mesmo volume de
dados, depois de fazer um backup e conferir o caminho `DATABASE_PATH`.
A importação não deve ser executada em paralelo a uma segunda escrita.

Cada consulta Overpass é limitada a 40 km, 500 elementos e 30 s de timeout;
execute regiões separadamente e respeite a capacidade do serviço público.
Falhas externas não apagam o banco. Os itens importados recebem ID e link
para o elemento OSM de origem, `managed=0`, permanecem ativos no catálogo
e alimentam `stations` e `locations`; atualizações **não sobrescrevem**
local desativado ou gerenciado pelo Admin.

Na aba Explorar, a busca de atrações passa a consultar até 120 km (no máximo
150 itens retornados), e a pesquisa usual de postos/mapa mantém o raio padrão
de 5 km. O cálculo efetivo das rotas continua dependendo do OSRM;
importar o ponto geográfico **não cria automaticamente** uma estrada transitável
ou um roteiro verificado. Para estradas cênicas, a posição OSM é apenas
uma referência, não a geometria completa da estrada.

Dados de origem: contribuidores do OpenStreetMap (ODbL);
atribuição: https://www.openstreetmap.org/copyright.
