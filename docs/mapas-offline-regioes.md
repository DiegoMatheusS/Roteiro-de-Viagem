# Mapas offline por região — estrutura inicial

## Estado desta etapa

O Rolê agora dispõe de um modelo de regiões e de uma camada de persistência IndexedDB para tiles **fornecidos por uma fonte com direito de armazenamento offline**. O app possui agora, em **Perfil → Privacidade → Mapas por região**, importação experimental de pacotes raster JSON locais, listagem de espaço ocupado e exclusão. Pacotes completos agora podem ser **selecionados e exibidos no MapLibre sem internet**, a partir do menu de camadas do mapa. **Não** inclui download direto de regiões, suporte a MBTiles/ZIP nem cálculo de trajetos ou recálculo de rotas sem internet.

Os arquivos `src/services/offlineMapRegions.ts` e `src/services/offlineMapStorage.ts` oferecem:

- Definir regiões por limites geográficos, zoom, origem e atribuição obrigatória.
- Validar se a origem declara autorização específica para armazenamento offline.
- Limitar cada região a 3.000 tiles e 50 MB de dados e cada aparelho a quatro regiões.
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

## Exibição local no MapLibre

Depois de importar um pacote completo em **Perfil → Privacidade → Mapas por região**, abra o mapa e toque em **Camadas → Mapas armazenados**. Escolha uma região para visualizar os tiles locais. No modo de navegação, o botão **Mapas locais** permite alternar entre a região e o mapa online. A escolha é mantida neste aparelho.

O renderizador registra o protocolo `role-offline://`, cujas leituras vêm exclusivamente do IndexedDB; não há fallback silencioso para provedores externos quando um tile local falta. A atribuição declarada no pacote é preservada. O mapa avisa se o GPS está fora da área da região armazenada; fora da cobertura ou de seus níveis de zoom, partes do mapa podem ficar vazias. Se a região for removida, a preferência local é desativada.

**Limites:** a base raster pode ser visualizada sem internet quando já estiver instalada e o aplicativo Android estiver aberto/disponível; o modo web só inicia sem conexão se os arquivos do próprio site tiverem sido disponibilizados por outro mecanismo. Ícones, posições previamente conhecidas e o traçado já existente podem continuar na tela, mas novas rotas, desvio com recálculo, dados de trânsito, clima, busca de locais e sincronização de comboios continuam dependendo dos respectivos serviços online.

## Integração a realizar

### Formato de pacote já importável

Use um arquivo JSON local de até **70 MB codificados**, com a estrutura:

```json
{
  "format": "role-raster-region-v1",
  "region": {
    "id": "mapa-autorizado-01",
    "name": "Centro da cidade",
    "bounds": {"south": -23.56, "west": -46.65, "north": -23.54, "east": -46.63},
    "minZoom": 12,
    "maxZoom": 12,
    "sourceId": "provedor-com-direitos-offline",
    "attribution": "© Provedor de mapas autorizado",
    "offlinePermissionConfirmed": true
  },
  "tiles": [
    {"z": 12, "x": 1517, "y": 2327, "mime": "image/png", "dataBase64": "CONTEUDO_BASE64"}
  ]
}
```

O exemplo é apenas **esquemático**, não um pacote utilizável: os valores x/y devem corresponder à grade Slippy Map/XYZ e devem estar presentes **todos os tiles contados para a área e os níveis de zoom definidos**. Cada imagem deve corresponder ao MIME anunciado, ter até 1 MB e ser obtida de provedor que autorize sua distribuição e armazenamento offline.

O importador valida a cobertura/quantidade de tiles, verifica duplicações, formatos e atribuição antes de criar a região; registra os tiles localmente e tenta apagar a região em caso de falha. Se a limpeza falhar, o usuário verá instruções para remover o pacote incompleto nas configurações. Pacotes locais são salvos **no próprio aparelho**, sem envio à Railway. Esta etapa não inclui criptografia nem armazenamento de dados sensíveis.

### Próximas etapas

1. Verificar a leitura e o desempenho real da base local no Android físico, inclusive reinstalação/reabertura do app e troca entre regiões.
2. Disponibilizar pacotes em formato apropriado para distribuição (por exemplo, ZIP/MBTiles) somente quando licenças e parser seguro estiverem definidos.
3. Definir provedor/licença para download de áreas, identificação e limites do cliente Android e cancelamento/progresso.
4. Implementar motor de roteamento offline separado para criar e recalcular trajetos sem rede.

O backend Railway não é necessário para a estrutura local implementada aqui.
