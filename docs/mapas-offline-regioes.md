# Mapas offline por região — estrutura inicial

## Estado desta etapa

O Rolê agora dispõe de um modelo de regiões e de uma camada de persistência IndexedDB para tiles **fornecidos por uma fonte com direito de armazenamento offline**. O código ainda **não** inclui um botão de download de mapa, instalador de pacotes, roteamento offline ou um estilo MapLibre carregado a partir dessa base. Não apresentar esta etapa como "mapa offline disponível".

Os arquivos `src/services/offlineMapRegions.ts` e `src/services/offlineMapStorage.ts` oferecem:

- Definir regiões por limites geográficos, zoom, origem e atribuição obrigatória.
- Validar se a origem declara autorização específica para armazenamento offline.
- Limitar cada região a 3.000 tiles e 50 MiB de dados e cada aparelho a quatro regiões.
- Armazenar imagem PNG/JPEG/WEBP por zoom, x, y, com contagem e bytes atualizados atomicamente no IndexedDB.
- Ler tiles sem internet quando efetivamente gravados, verificar se um pacote está completo e excluir uma região liberando espaço.
- Rejeitar imagem de erro HTML, tile fora dos limites, zoom fora do pacote ou região sem permissão.
- Nenhuma requisição externa é feita pelos serviços; não ocorre varredura de área, prefetch ou alteração de provedores atuais.

## Restrições reais de provedores

A política de `tile.openstreetmap.org` proíbe download em massa e uso offline; o app **não** deve usar essa origem para salvar regiões.

A política de OpenFreeMap, em 22/10/2026, permite downloads offline por área com até **3.000 tiles ou 50 MB**, no máximo **quatro requisições em paralelo** e `User-Agent` identificável. O suporte presente no código adota esses limites como valores conservadores, mas **não** inicia download: antes disso, o cliente Android precisará enviar corretamente o identificador e o fluxo de download deverá obedecer ao contrato específico do provedor. Navegadores não permitem definir livremente o cabeçalho `User-Agent` em uma chamada `fetch` comum.

Consultar políticas atualizadas antes de ativar:
- https://openfreemap.org/tos/
- https://operations.osmfoundation.org/policies/tiles/

Não estender permissões do OpenFreeMap automaticamente aos provedores de **satélite (Esri)** ou **relevo (OpenTopoMap)**. Cada um exige autorização independente.

## Integração a realizar

1. Definir provedor/licença para baixar áreas e estratégia de identificação correta do cliente Android. Em alternativa, fornecer pacotes de tiles próprios/licenciados por importação.
2. Ligar o ingest de tiles à camada de armazenamento, com controle explícito de progresso/cancelamento, orçamento de espaço e limite de simultaneidade.
3. Conectar os pacotes completos ao MapLibre (estilo local e fontes offline) mantendo atribuição e câmera; nunca anunciar pacote incompleto como disponível.
4. Validar navegação sem rede e reabertura do app no Android físico. Rotas novas e recálculo após erro de direção precisam de motor de roteamento local separado; tiles sozinhos não fazem isso.

O backend Railway não é necessário para a estrutura local implementada aqui.
