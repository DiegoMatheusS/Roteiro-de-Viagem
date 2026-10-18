# Roteiro de Viagem

Aplicativo React/Vite para planejar passeios de carro e moto, com garagem, histórico, mapa, Comboio de Viagem e preços colaborativos de combustíveis.

## Executar localmente

Requisito: Node.js **22.18 ou superior** (recomendado: Node.js 24).

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. O comando inicia o frontend e a API na porta 3001. O banco SQLite é criado automaticamente em `data/roteiro.sqlite`. Contas, sessões, postos reais, preços, votos, denúncias, ações de moderação e conteúdo das fotografias ficam no banco. O diretório `data/` é privado e não entra no Git.

**Os preços são conferidos manualmente pelo administrador. Não há Gemini, OCR, reconhecimento de texto ou serviços pagos de leitura de imagens.**

## Dados da conta e sincronização

Novas contas começam **sem veículos, viagens, abastecimentos, contatos SOS ou conquistas desbloqueadas**. Cadastre seu veículo em **Ajustes → Minha Garagem** antes de criar um passeio. Dados ilustrativos permanecem apenas nas telas explicitamente identificadas como exemplos e em fixtures de testes, nunca dentro da conta.

Depois do login, o frontend consulta `GET /api/me/state` e carrega **perfil, veículos, abastecimentos, estatísticas, conquistas, roteiros salvos, viagem em andamento e rascunhos privados de comboios** do SQLite. As alterações feitas na conta são enviadas a `PUT /api/me/state` com debounce e cookie de sessão; o servidor vincula os registros ao usuário autenticado e rejeita versões antigas (HTTP 409) para evitar substituição silenciosa. O aplicativo informa quando uma sincronização falha e permite a escolha explícita de qual versão manter se houver conflito.

Há cache local específico para cada conta. **Dados antigos em `rdv_*_v1` são preservados no navegador mas não importados automaticamente**, para impedir que registros de demonstração e dados de outras pessoas entrem na conta. O recurso de importação assistida será implementado separadamente, após confirmar a propriedade dos dados.

Os Comboios usam sessões e integrantes separados no servidor. Conta e histórico recebem atualizações de outros aparelhos a cada 15 segundos, ao voltar ao aplicativo e ao recuperar a conexão. Alterações em registros ou campos diferentes são combinadas usando a última versão confirmada; conflitos no mesmo campo mostram as duas versões para escolher somente o que divergiu. Uma cópia local é preservada antes da escolha. Aparelhos que já carregaram a conta podem continuar com seus dados em cache e salvar alterações sem conexão; a primeira entrada ainda exige acesso ao servidor. O servidor continua validando a sessão e as revisões em toda gravação. O nome editado no perfil também atualiza o nome exibido no Comboio. O arquivo SQLite e seu diretório de dados precisam ser mantidos em armazenamento persistente, com backup e recuperação testados antes de publicar o serviço. Essa implementação inicial usa snapshots JSON por conta; pode ser normalizada em tabelas individuais conforme o crescimento.

## Como contribuir

1. Abra o mapa e toque no ícone de um posto real.
2. Confira preços, tipo de combustível, data de observação, origem, confiabilidade e horário conhecido.
3. Entre na conta ou cadastre uma conta para informar um preço, enviar foto, confirmar, contestar ou denunciar.
4. Use **Enviar foto dos preços**, tire uma foto ou escolha da galeria, informe a data da fotografia e confirme que ela corresponde ao posto selecionado. A mensagem **Foto enviada para análise** confirma o envio; nenhum valor é identificado automaticamente.
5. Fotos ficam privadas até aprovação da moderação. Elas são reprocessadas sem EXIF, GPS ou nome original. O dono pode remover suas fotos.

Nunca há preços pré-cadastrados ou inferidos quando a informação não existe. A ausência aparece como **sem preço informado**. Preços observados há mais de 72 horas continuam visíveis como **desatualizados**, mas não entram na comparação. Todas as novas contribuições de preço aguardam aprovação administrativa. Valores ausentes nunca são preenchidos; preços anteriores aprovados permanecem até a aprovação de novos valores.

A confiabilidade considera idade da observação, confirmações, contestações e histórico de contribuições confirmadas. Cada conta pode ter um voto por preço e não pode confirmar o próprio preço. Há limites por usuário/IP, intervalo entre contribuições iguais, limite diário e fila de denúncias.

Fotografe e use os controles somente com o veículo parado. Evite imagens com rostos, placas de veículos e dados pessoais.

## Paradas manuais no Início

Os campos **Origem**, **Destino** e **+ Adicionar parada** ficam na tela Início, sem nova aba. Pesquise explicitamente cidades, endereços, restaurantes, postos e atrações e selecione um resultado real. Alterar o texto invalida a localização anterior. O GPS também pode definir a origem.

Até 12 paradas obrigatórias podem ser adicionadas entre origem e destino, com tempo opcional de permanência (0 a 1440 minutos). Arraste o controle ☰ pelo mouse/toque ou use as setas para mudar a sequência; edite ou remova apenas os itens que desejar. Inverter origem/destino também inverte a ordem das paradas.

Nos modos **Por Km**, **Por Horas** e **Com Destino**, paradas escolhidas ou destino explícito acionam cálculo rodoviário no OSRM, com todos os pontos na ordem escolhida. O tempo total inclui deslocamento e permanência. O combustível e o orçamento acompanham a distância calculada. Limites incompatíveis geram aviso e exigem confirmação para continuar acima do limite; o aplicativo nunca elimina paradas para ajustar o orçamento. Um percurso menor que o alvo de km informa o espaço disponível para ampliar o passeio.

Depois de gerar o roteiro, é possível adicionar, editar, ordenar e remover paradas na mesma tela de planejamento. O cálculo é atualizado com debounce/cancelamento de resultados anteriores. Salvar, iniciar e compartilhar ficam indisponíveis enquanto o cálculo estiver pendente ou inválido. Falhas dos provedores são exibidas, sem substituir a distância por uma estimativa em linha reta.

Sugestões reais são apresentadas separadamente, a partir dos estabelecimentos cadastrados próximos ao percurso. Elas só entram na rota quando aceitas e podem ser descartadas/removidas. A inserção não reordena nem exclui as paradas obrigatórias. A estrutura mantém essa separação para uma futura integração de IA; **esta versão não chama serviços de IA para sugerir atrações**.

A busca usa [Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md), com cache de 24 horas, consulta explícita, limites por IP e no máximo uma solicitação externa por segundo/instância. O serviço público é demonstrativo e pode limitar consultas; configure uma instância apropriada em `GEOCODING_URL` para maior volume. O roteamento usa [OSRM](https://project-osrm.org/docs/v5.24.0/api/#route-service), sem trânsito em tempo real. Esses provedores **não retornam tarifas de pedágio**. A consulta colaborativa separada identifica praças no OpenStreetMap e soma apenas tarifas aprovadas, mantendo o orçamento parcial.

Salvar conserva identidades, ordem, permanências, obrigatórias/sugestões aceitas, limites e pontos rodoviários. Em **Compartilhar Rota**, escolha a proteção de origem e use **Gerar link do roteiro**. O link armazenado no banco abre em outros dispositivos sem login, preserva todas as paradas e dura 90 dias. A proteção aproxima a origem e oculta pontos do desenho a menos de 2 km dela; paradas no próprio ponto de partida também são aproximadas. As demais paradas escolhidas são compartilhadas. O link não inclui contas, veículos, participantes ou localização ao vivo. Links vinculados à conta são removidos quando o administrador exclui a conta.

No Início, passeios automáticos **Por Km** e **Por Horas**, sem destino ou paradas manuais, consultam atrações identificadas no OpenStreetMap e calculam trajetos rodoviários no OSRM. O algoritmo tenta conciliar a distância ou duração com paradas reais, mas não garante encontrar um percurso compatível; nesse caso mostra um erro útil, sem inventar atrações, avaliações ou distâncias. Passeios com destino/paradas explícitos usam o roteamento rodoviário existente e preservam a ordem escolhida. A pesquisa automática usa o Overpass público apenas para baixo volume, com limites por IP e consultas limitadas; é necessário um provedor adequado antes da produção. Todos os caminhos de planejamento executáveis agora exigem cálculo rodoviário. O mapa começa sem viagem de exemplo; a origem é escolhida pelo usuário ou pelo GPS. A comunidade permanece vazia até existir uma fonte de roteiros publicados, sem autores ou avaliações inventados.

## Comparar postos e calcular custos

No planejamento, abra **Encontrar combustível mais barato**. Informe o combustível compatível com o veículo, consumo nesse combustível, combustível restante e quantidade a abastecer. Opcionalmente, informe a saída planejada.

O comparador usa postos do OpenStreetMap/Overpass e distâncias rodoviárias do OSRM. Compara abastecimento mais combustível do desvio, distância até o posto e autonomia estimada. Preços antigos ou com contestação predominante são excluídos. Postos fora da autonomia ou fechados no horário de chegada, quando esse horário foi verificado, não são recomendados. Horários sem verificação ou sem interpretação segura permanecem desconhecidos.

A consulta é limitada a oito postos com preços recentes por comparação, e a tela informa candidatos não consultados e desvios indisponíveis. Não há substituição por distância em linha reta quando a API de roteamento falha. **Usar preço no cálculo da viagem** atualiza o orçamento e guarda o posto, a contribuição e a data usados. Sem preço escolhido ou informado, o orçamento é identificado como parcial.

## Painel administrativo web

Para hospedar o frontend e o painel no Cloudflare Pages, mantendo API e dados no Railway, consulte [a configuração Cloudflare + Railway](docs/cloudflare.md).

O **painel administrativo é um site separado** do aplicativo público, mantido no repositório de administração. A rota `/admin` e as URLs `/api/admin/*` no domínio público do viajante respondem 404; o aplicativo público não exibe o painel nem seus links. As APIs de administração continuam disponíveis ao **site administrativo separado** pelo backend do Railway e exigem autenticação, sessão de administrador e permissões no servidor. Remover links não substitui autorização no backend.

Cadastre sua conta pelo aplicativo e, no terminal do servidor, autorize-a:

```bash
npm run admin -- email-da-conta
```

Entre novamente ou atualize a página. Cadastros públicos não recebem privilégios; não existe senha administrativa padrão. O comando antigo `npm run moderator` continua como alias. Contas antigas de moderador são migradas para administrador.

A fila de fotos mostra as mais recentes primeiro, com posto, endereço, autor, data de envio, data da fotografia e histórico de valores. Confira a imagem e preencha apenas os preços legíveis. **Aprovar e publicar** registra os valores e o revisor em uma transação; **Rejeitar** e **Solicitar nova foto** registram o motivo. O viajante acompanha o estado e o motivo em **Minhas fotos neste posto**. Aprovar uma foto não reconhece nem preenche preços automaticamente. Fotos denunciadas voltam a ficar privadas até revisão.

É possível corrigir preços pelo cadastro do posto: cada alteração cria uma atualização ligada ao valor anterior, preservando o histórico. Preços antigos publicados automaticamente na versão anterior e sem aprovação registrada retornam à fila de revisão na migração. Valores que já tinham aprovação administrativa permanecem publicados.

Cada unidade é vinculada a um ponto real do OpenStreetMap. Cole seu link para cadastrar; a API de mapas verifica a existência e a categoria. O administrador pode editar nome, endereço, descrição, telefone/site do estabelecimento, estado ativo e horário confirmado. Excluir um estabelecimento o retira do mapa e das comparações, mas preserva o histórico; a atualização do provedor não o reativa. Use **Editar** para reativar um cadastro. Restaurantes e outras atrações ativas aparecem como marcadores no mapa do aplicativo.

Comentários de estabelecimentos são armazenados no servidor e aguardam aprovação. O painel permite aprovar, rejeitar ou excluir, e viajantes podem denunciar comentários publicados. Avaliações privadas de viagens antigas no navegador continuam separadas.

O administrador pode bloquear/desbloquear ou excluir contas. Bloqueio e exclusão revogam sessões; exclusão remove fotos, votos e conteúdo de comentários, elimina nome/e-mail/senha e mantém preços aprovados no histórico sem identificação pessoal. Sua própria conta e o último administrador ativo são protegidos. Exclusões exigem confirmação na interface e no servidor. As ações ficam na auditoria.

Fotos têm limite de envio de 8 MB/24 MP, são redimensionadas até 1600 px e comprimidas em JPEG sem EXIF/GPS/nome original (máximo de 1 MB armazenado). Há limite de 3 tentativas por 10 minutos e 10 fotos por dia por conta, além de bloqueio de duplicatas recentes. Filas são paginadas em 20 registros, indexadas, e não carregam os bytes da imagem até sua visualização. Fotografe somente com o veículo parado e não publique dados pessoais.

## Configuração e execução em servidor

As opções estão em `.env.example`. Use `.env` para configurar portas, caminho do banco, domínio e provedores de mapas. Os servidores públicos de mapas podem ficar indisponíveis ou limitar consultas; o aplicativo informa a falha e só reutiliza estabelecimentos já consultados, sem inventar preços. Para uso com tráfego real, configure provedores adequados ao volume pelo `OVERPASS_URL` e `ROUTING_URL`.

```bash
npm run build
npm run start
```

Para servir frontend e API juntos, configure `NODE_ENV=production`, `PUBLIC_APP_URL` com a origem HTTPS pública, e `API_PORT` com a porta do servidor. Em produção os cookies são Secure. Use HTTPS e preserve o banco e o diretório `data/` em volume persistente; faça backups do SQLite incluindo as fotografias. Esta versão usa uma instância de API por banco SQLite.

## Verificação

```bash
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

O GitHub Actions executa tipos, regressões de permissões/moderação, build e fluxos mobile e administrativo no navegador, incluindo paradas reais, arrastar/recalcular, salvar e compartilhar entre páginas. Os testes de interface usam provedores de mapas controlados **apenas dentro dos testes**, sem inserir postos fictícios no aplicativo real.

## Clima e pedágios reais

No planejamento, informe a saída e consulte a previsão Open-Meteo para até cinco pontos do percurso. Os horários aproximados distribuem o tempo de condução pela distância e acrescentam a permanência nas paradas já atravessadas. Uma saída programada no Início é preservada no planejamento; se o horário já passou, será no dia seguinte. Falhas ou viagens fora da janela de previsão deixam o clima indisponível, sem preencher valores de exemplo. A camada de chuva mostra marcadores de previsão com atribuição e data, incluindo vento, neblina, neve e trovoadas; **não é radar ao vivo**. Use `WEATHER_URL` e, quando necessário, `WEATHER_API_KEY`. O endpoint público tem licença para uso não comercial; antes de distribuir comercialmente, configure um provedor licenciado ou uma instância própria. [Documentação e condições](https://open-meteo.com/en/pricing).

Pedágios são identificados no OpenStreetMap, próximos ao traçado rodoviário, e podem ser abertos pelos marcadores no planejamento, mapa e navegação. Em **Informar tarifa ou enviar foto**, informe data, valor e sentido da passagem para a categoria do veículo da viagem. É possível selecionar ou tirar uma foto e conferir a imagem antes de enviá-la. **Minhas contribuições** mostra aprovação, rejeição e observações do revisor apenas ao autor. Fotos são conferidas manualmente; não há OCR. A fila **Pedágios** do admin aprova ou rejeita contribuições, guarda o revisor e o histórico, e mantém as fotos privadas. Valores aprovados valem por 90 dias a partir da evidência. Sem valor ou com evidência vencida, aparece tarifa não informada.

A consulta de praças é limitada e **não comprova que uma estrada é livre de pedágio**. O orçamento inclui apenas os valores aprovados identificados, conforme sentido, quantidade de passagens e veículos da mesma categoria. Ida e volta têm valores individuais; tarifas diferentes nunca viram uma média. Nós de faixas próximas na mesma praça são agrupados para evitar cobrança duplicada e preservar contribuições das outras faixas. Praças incompletas no mapa, free-flow e veículos com reboques/eixos adicionais exigem conferência separada.

O mapa e a navegação atualizam clima e tarifas ao abrir, a cada 15 minutos com o aplicativo visível, ao recuperar a conexão ou voltar à tela, e pelo botão **Atualizar clima e pedágios**. Durante uma viagem, um GPS recente e preciso limita a previsão ao trecho restante; sem posição válida, usa-se o percurso completo. O orçamento da viagem e sua divisão por pessoa são recalculados com as tarifas atuais. `npm run check:weather` faz uma consulta real ao provedor usando coordenadas fixas sem dados pessoais; o CI registra esse diagnóstico separadamente dos testes controlados.

## Comboio entre celulares

Crie um Comboio de uma viagem e compartilhe seu código. O outro viajante entra na própria conta e usa **Entrar no comboio**. Sessões e integrantes ficam no SQLite, com autorização por membro e alterações do roteiro restritas ao organizador. O organizador pode publicar o roteiro atualizado e remover pontos de encontro, mantendo os check-ins dos pontos restantes. Alterações de roteiro usam uma revisão própria para evitar sobrescrever outra edição; atualizações de GPS não impedem a publicação. Participantes comuns apenas consultam, compartilham sua posição e confirmam presença. A tela atualiza a cada cinco segundos. O nome e veículo são visíveis ao grupo; endereço de e-mail e dados privados da conta não entram na sessão.

Cada participante começa com GPS desligado e ativa o compartilhamento explicitamente. Só posições recentes com precisão de até 50 metros são aceitas. Desativar remove as coordenadas; atualizações atrasadas não restauram consentimento. Posições com mais de três minutos somem. Sair, encerrar, bloquear ou excluir a conta interrompe o compartilhamento. Voltar ao menu mantém o compartilhamento ativo, com aviso e botão **Parar compartilhamento**. É possível ver participantes nos mapas da viagem e do Comboio sem recarregar a página. Posições atrasadas são ignoradas e posições vencidas também somem no cliente quando o servidor está inacessível. Cada ativação recebe um identificador de sessão de GPS: outro aparelho da mesma conta precisa ativar o envio explicitamente, e o aparelho anterior não pode enviar nem interromper a sessão nova. Revogações sem conexão são guardadas para repetir ao reconectar; enquanto o servidor não recebe a revogação, a última posição pode permanecer visível por até três minutos. Não são usados WebSockets; essa sincronização usa consultas e envio periódico a cada cinco segundos.

## Navegação e encerramento

A seta no canto esquerdo da navegação volta ao menu mantendo a viagem em andamento. Use **Retomar mapa** para voltar. O GPS fica no nível do aplicativo, independente da tela. A distância medida é preservada em checkpoints; intervalos sem sinal não são ligados como deslocamento. Uma viagem em andamento recebida de outro aparelho aparece sem iniciar GPS automaticamente; **Assumir navegação neste aparelho** transfere a identificação do aparelho de navegação. O estado sincronizado interrompe o acompanhamento antigo ao ser recebido. Sem conexão, esse recebimento depende da retomada da sincronização.

**Encerrar viagem** fica na navegação e na visualização da viagem programada, com confirmação. Interrompe a sessão e mantém o registro como **Encerrada**, sem conclusão nem medalhas. **Concluir viagem** registra a distância efetivamente percorrida. “Alterar rota” fica à esquerda e o zoom à direita. Alterar a rota mantém suas paradas e a distância já registrada. Para iniciar outra viagem diferente, encerre a sessão atual.

## Android

O projeto contém um app Capacitor 8 com interface embutida, cliente HTTP nativo para a API HTTPS e cookies privados do aplicativo. GPS usa um serviço Android de localização em primeiro plano, iniciado pelo usuário, com notificação permanente e botão **Parar GPS**. Ele mede distância enquanto a tela está bloqueada e preserva os checkpoints no celular. O mesmo serviço envia posição ao Comboio a cada cinco segundos apenas com consentimento ativo, inclusive fora da tela do mapa. O identificador da sessão acompanha cada envio. O botão **Parar GPS** é respeitado depois de recarregar a interface; o envio só recomeça com uma nova ativação explícita. Não inicia no boot e não reinicia automaticamente depois de encerrado pelo sistema.

Preparação no computador com Node 24, JDK 21, Android SDK 36 e Android Studio compatível:

```bash
# Linux/macOS
RDV_API_URL=https://origem-https-do-backend npm run android:sync
npm run android:open
```

```powershell
# PowerShell
$env:RDV_API_URL="https://origem-https-do-backend"
npm run android:sync
npm run android:open
```

No GitHub, o workflow **Validar Android** compila um APK debug separado do aplicativo release e pode gerar APK/AAB assinados com a chave do proprietário. Os workflows também testam o serviço no emulador Android 13/16 e o backend em container. Consulte [compilação e validação Android](docs/android.md) e [backend HTTPS](docs/backend.md). Para um APK conectado ao serviço real, configure a variável de repositório `RDV_API_URL` ou execute o workflow manualmente com a origem HTTPS. Sem essa configuração, o APK serve somente para verificar compilação e não consegue acessar a conta. Antes da distribuição pública, assine o release com a chave do proprietário e valide os cenários abaixo em aparelhos reais. [Requisitos do Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup) e [serviço de localização Android](https://developer.android.com/develop/background-work/services/fgs/service-types#location).

Validação física pendente: Android 13–16, permissão negada/aproximada/precisa, notificação negada, GPS desligado, tela bloqueada por 30 minutos, economia de bateria, perda de internet, revogação de consentimento, encerramento pela notificação e pelo aplicativo, logout, troca de conta, SOS com coordenada recente e abertura dos contatos cadastrados. O SOS abre ligação/WhatsApp; não envia alertas automaticamente nem confirma recebimento. A distância registrada não representa certificação antifraude.

## Limites de produção

Os testes usam provedores controlados; disponibilidade e cobertura externa dependem dos provedores configurados. Overpass, Photon e OSRM públicos são adequados apenas para baixo volume. API e SQLite precisam de hospedagem HTTPS, disco persistente e backups com recuperação testada. O app usa uma instância de API por banco. Android tem build, assinatura configurável e testes instrumentados de tela apagada no emulador. A distribuição depende de backend HTTPS real, chave do proprietário, conta de distribuição e validação física com tela bloqueada.

## Provedores e identidade Google

**Mapas e roteamento:** OpenStreetMap (dados), MapLibre GL JS (base vetorial Positron do OpenFreeMap) com Leaflet temporariamente preservado para os marcadores/gestos e como fallback raster; OSRM (trajetos, km e duração). O Google Maps não é utilizado. Os estilos visuais e os marcadores são próprios. As instâncias públicas de OSRM, Photon e Overpass servem apenas para testes e uso limitado; antes de comercializar, configurar provedores hospedados/licenciados com limites adequados.

**Login Google para o site:** criar uma credencial OAuth 2.0 do tipo Aplicativo Web no Google Cloud e cadastrar a origem pública HTTPS do Cloudflare Pages em `Origens JavaScript autorizadas`. Colocar **somente o Client ID** na variável `GOOGLE_CLIENT_ID` do backend Railway. O botão usa Google Identity Services e o backend verifica a assinatura RS256, o emissor e o público do ID Token com as chaves oficiais do Google. Nunca usar uma chave de Google Maps nem colocar um Client Secret no frontend. O cadastro com e-mail e senha continua disponível, com confirmação da senha.

Quando o e-mail já pertence a uma conta de viajante, o login Google vincula-se ao **mesmo ID de usuário** e preserva senha, perfil, viagens e registros. Para endereços Gmail verificados ou contas de organização com domínio hospedado pelo Google, o vínculo pode ser automático; para endereços externos o site solicita a senha atual **uma única vez** para confirmar a posse do cadastro. Contas bloqueadas continuam impedidas. Contas administrativas podem vincular o Google **apenas para usar o aplicativo como viajante**: na primeira vez, devem confirmar a senha atual mesmo se o e-mail for Gmail. Sessões obtidas pelo Google não autorizam nenhuma rota de administração; o painel administrativo continua exigindo login com e-mail e senha. Contas vinculadas a outro identificador Google não são mescladas. **Login Google no Android:** o aplicativo já tem o fluxo nativo Google Sign-In. Para funcionar no APK assinado, é necessário cadastrar no Google Cloud o cliente OAuth Android com o ID do pacote e SHA-1 da assinatura, além do `GOOGLE_CLIENT_ID` do backend. Sem essa configuração, o aplicativo mantém login por e-mail e senha.

**Permissão de localização:** os modos Por Km e Por Horas pedem a posição GPS. Caso o acesso seja negado, uma mensagem explica como permitir e, no Android, abre as configurações do aplicativo. No modo Com destino é possível escolher origem e destino manualmente sem localização.

## Mapa e confiabilidade dos dados (PR #43)

- Marcadores de postos exibem apenas preços publicados, não vencidos e não contestados retornados pela API. Quando não há valor aprovado, o mapa não inventa um preço.
- Pedágios exibem o valor unitário quando fornecido para o sentido/veículo consultado, nunca o custo total do trajeto.
- Estabelecimentos turísticos e comerciais usam pictogramas vetoriais padronizados.
- O velocímetro mantém estado neutro quando não consegue associar a posição a um limite `maxspeed` explícito. O cache é curto e restrito a coordenadas próximas; consulte sempre a sinalização real.
- Os geradores locais antigos de rotas, tempo, clima, pedágios e avaliações simuladas, bem como listas comunitárias fictícias sem usuários reais, foram retirados. A geração pública continua usando rotas rodoviárias verificadas.
- **MapLibre:** a migração do renderizador Leaflet depende de um estilo vetorial e de provedor de tiles adequado para produção. Não usar estilos demonstrativos sem licenciamento nem quebrar os controles de GPS, alertas ou de rotas.
- **Trânsito em tempo real:** ainda indisponível no OSRM. Não apresentar a duração como previsão com tráfego.

## Mapa vetorial (PR #44)

- O estilo claro agora carrega MapLibre GL JS + OpenFreeMap Positron (sem chave), com ruas neutras, água azul, vegetação verde e construções claras. A base vetorial é carregada sob demanda.
- Nesta etapa, **MapLibre já desenha as linhas de rotas calculadas, alternativas e trechos percorridos por GPS**. Leaflet continua cuidando de gestos, áreas de toque das alternativas, marcadores de postos/preços e alertas por meio do adaptador `@maplibre/maplibre-gl-leaflet`. A migração desses overlays e da câmera (incluindo rotação) será posterior.
- Se WebGL não estiver disponível, o estilo falhar ao carregar ou houver erro de rede, o app volta automaticamente para a camada raster OpenStreetMap, sem perder a rota em andamento.
- Satélite Esri e relevo OpenTopoMap permanecem como alternativas. A tela Android precisa de suporte a WebGL 2 para a camada vetorial MapLibre GL JS 6.
- Tiles e estilo são serviços de terceiros fornecidos conforme sua disponibilidade; respeite atribuição, termos e licenças de OpenFreeMap/OpenStreetMap. Consulte [OpenFreeMap](https://openfreemap.org/) e [MapLibre](https://maplibre.org/).
- O estilo vetorial não fornece dados de trânsito ou limites legais de velocidade: a aplicação mantém a indicação neutra quando não houver fonte válida.

## Atualização de rotas vetoriais (PR #45)

- Todas as linhas usam os percursos efetivos retornados pelo OSRM; nenhuma geometria artificial é criada.
- O trecho a percorrer é azul-claro e o percorrido é azul-escuro **somente quando a posição GPS corresponde ao trajeto**. Fora do percurso, não se declara uma parte da viagem como concluída.
- Rotas alternativas permanecem clicáveis e podem ser selecionadas sem recriar o mapa ou mudar o zoom.
- O fallback raster usa as mesmas geometrias e interações implementadas no Leaflet.
- O app continua sem API de tráfego em tempo real; não exibir esse dado como disponível.

## Marcadores no MapLibre (PR #46)

- A camada vetorial agora também usa marcadores DOM do **MapLibre** para postos, pedágios e atrações verificadas no backend. Com o mapa raster, o Leaflet mantém os mesmos locais e ações.
- Valores de combustível aparecem no marcador apenas se a API tiver preço aprovado e não contestado nem vencido; as tarifas unitárias de pedágio precisam estar verificadas. Nada de preços fictícios.
- O mapa impede duplicação de pedágio quando a praça consta simultaneamente da rota e do cadastro geográfico. Marcadores sem latitude/longitude válidas são ignorados.
- Botões de preços e comentários, identificação por categoria, ações de toque e rótulos para acessibilidade permanecem. O mapa não exige login para pesquisar rotas; contribuir com preços continua sujeito à autenticação.
- O controle de gestos e os alertas colaborativos ainda são responsabilidade do Leaflet nesta fase, evitando mudança simultânea de todos os recursos. A migração completa para um único renderizador pode ser feita com testes próprios.

## Alertas comunitários vetoriais (PR #47)

- O mapa claro já exibe **alertas aprovados e não vencidos** como marcadores MapLibre acessíveis por teclado, com ícones SVG e visual compacto (sem emojis do dispositivo).
- Ao tocar ou clicar no marcador, o aplicativo mantém o diálogo **“Ainda continua lá?”**, as confirmações e as regras atuais de moderação. Notas e textos enviados pela comunidade não são inseridos como HTML.
- Caso a base vetorial esteja indisponível, o Leaflet renderiza os mesmos alertas usando a mesma seleção de dados confiáveis. A troca entre renderizadores remove os marcadores anteriores antes de permitir novas interações, evitando duplicações.
- Nesta fase o Leaflet ainda controla os gestos e parte dos overlays da navegação, SOS e comboio. Não foi ativado trânsito em tempo real ou um sistema de multas/limites presumidos.

## Pinos de navegação no MapLibre (PR #48)

- Origem, destino e localização do GPS agora usam marcadores MapLibre nativos na camada vetorial. Os ícones são leves e têm textos acessíveis e balões de informação.
- Atualizações sucessivas do GPS apenas movimentam o marcador existente (`setLngLat`), preservando zoom e câmera, sem recriar o mapa.
- Em dispositivos sem WebGL ou quando há falha de tiles, Leaflet continua mostrando os mesmos pontos; as versões antigas dos pinos são removidas assim que os novos são instalados.
- Coordenadas inválidas não são desenhadas. Durante a navegação, não exibimos marcador estático de origem que possa confundir a posição atual.
- Ainda restam marcadores de paradas, comboios, pontos de encontro e amostras de previsão meteorológica no Leaflet. A remoção da dependência será feita em fase posterior após testes de gestos/câmera.

## Acesso ao comboio pelo Início (PR #50)

- Abaixo dos cartões KM e Horas há um único botão **Comboio**. O toque abre um pop-up minimalista com **Criar comboio** e **Entrar no comboio**.
- **Criar** abre o formulário de seleção da viagem e nome do grupo já existente; **Entrar** abre diretamente a entrada por código de convite. Não há botões separados ocupando espaço na página inicial.
- Ambos os pop-ups mantêm o mapa em segundo plano. Botão fechar, toque no fundo, tecla Escape e Voltar do Android descartam o pop-up de seleção.
- Criação utiliza a mesma API autenticada, sem inventar trajetos, e o compartilhamento de GPS segue desativado por padrão. Backend e painel administrativo permanecem intactos.

## Navegação mais fluida e leve (PR #51)

- Zoom por gesto e transições de blocos de mapa são animados **nas telas de navegação e no mapa principal**, com incrementos de meio nível. No mapa do comboio e nas prévias, o zoom Leaflet permanece imediato para que atualizações de participantes não alterem a posição visual de outros marcadores.
- A atualização GPS não desmonta mais o conjunto completo de trajetos, paradas, pontos de encontro e demais marcadores do fallback Leaflet. O marcador ao vivo é movido com `setLatLng` e o progresso restante/percorrido tem camada independente; no MapLibre, o marcador nativo continua usando `setLngLat`.
- A navegação acompanha o GPS de forma suave (pan curto), mas **ao arrastar o mapa o acompanhamento é suspenso** para não tomar o controle do gesto. O botão GPS retoma e recentraliza. Ao sair da navegação, o estado de suspensão é limpo.
- Usuários com preferência de movimento reduzido recebem centralização sem animação; o zoom por gesto e a navegação não deixam de funcionar.
- Sem animação de rotação por bússola nesta fase: o Leaflet ainda é responsável pelos gestos. A remoção integral do adaptador e a rotação controlada pelo rumo precisam de uma etapa posterior e de testes físicos.
- Efeitos da câmera e da pinça precisam ser confirmados em aparelho Android real; os testes automatizados cobrem as regressões de código, UI, build e emulador, não medem FPS de dispositivos diferentes.

## Paradas e comboios vetoriais — PR #52

- Paradas turísticas verificadas, pontos de encontro e participantes **com GPS compartilhado voluntariamente** são exibidos como marcadores DOM nativos do MapLibre. São exibidos apenas pontos com coordenadas válidas; locais e posições não são inventados.
- Participantes sem compartilhamento de localização ativo, localização vencida há mais de 3 minutos ou coordenadas inválidas não aparecem. Identificações e detalhes são inseridos com `textContent`, sem interpretar HTML fornecido pelo usuário.
- O marcador de um participante é atualizado incrementalmente por `setLngLat`, sem recriar os demais participantes e sem reiniciar a câmera. O fallback Leaflet utiliza `setLatLng` para o mesmo propósito.
- Os pontos de encontro continuam mostrando quantos participantes confirmaram chegada. Paradas com referência OSM de posto preservam os comandos de preços e comentários. No fallback raster, os mesmos marcadores e pop-ups permanecem.
- O renderizador MapLibre ainda usa a ponte de câmera/gestos Leaflet. Remover a dependência do Leaflet exige migrar os gestos e os overlays meteorológicos e validar o Android físico.

## Seta do GPS orientada pelo deslocamento (PR #53)

- Quando o GPS fornece um rumo real de deslocamento (`heading` no navegador/Capacitor e `Location.getBearing()` no Android nativo), a seta azul passa a apontar na direção de movimento, tanto no MapLibre quanto no fallback Leaflet.
- Direções inválidas, ausentes ou com velocidade conhecida inferior a 1,4 m/s não fazem a seta girar. A última direção válida é mantida para reduzir oscilações em paradas. A interpolação angular escolhe o caminho mais curto ao cruzar 0°/360°.
- A animação da seta respeita `prefers-reduced-motion`; não há novas permissões nem telemetria de GPS. O código não calcula rumo a partir de posições incertas nem inventa valores.
- **Nesta fase a câmera continua apontada para o norte:** a base MapLibre ainda usa gestos e viewport controlados pelo Leaflet. Girar apenas a câmera MapLibre causaria dessincronização das rotas e pinos. Rotação do mapa e gestos MapLibre independentes exigem uma próxima etapa que substitua o adaptador por um controlador único e seja testada em aparelhos reais.

## Controle de câmera da navegação — PR #54

- Durante uma viagem ativa, **arrastar o mapa suspende o acompanhamento automático**. O botão GPS passa a mostrar **Seguir GPS**, deixando explícito como voltar a acompanhar o veículo.
- Ao tocar em Seguir GPS, a câmera se recentraliza e volta a acompanhar as próximas posições. O zoom escolhido pela pessoa é preservado quando já está em escala útil de navegação, evitando saltos para um zoom fixo. Usuários que preferem movimento reduzido não recebem animação forçada.
- As operações de reposicionamento e acompanhamento agora passam por uma única interface de câmera (`mapCameraController.ts`). O **Leaflet continua sendo o dono da câmera no mapa híbrido**, garantindo que base MapLibre, pontos, rotas, alertas e áreas de toque se movam juntos.
- Um adaptador de câmera MapLibre para modo **standalone futuro** está definido e testado, mas **não é ativado na ponte híbrida**. Gestos nativos de rotação, inclinação e orientação do mapa pelo rumo continuam pendentes de uma migração conjunta de câmera e interações.
- Não muda permissões de GPS, não faz alterações no backend e não altera o painel administrativo. 

## Gestos de zoom sem disputa com GPS (PR #55)

- Na navegação ativa, **pinça com dois dedos, zoom pelo mouse/trackpad, duplo toque, gesto do Safari e teclas de zoom** suspendem o acompanhamento automático do GPS, assim como arrastar o mapa já fazia.
- O mapa não bloqueia os eventos de toque: os listeners são passivos e apenas mudam o modo de câmera para **Explorando**. O botão **Seguir GPS** permanece disponível para recentralizar e voltar ao acompanhamento mantendo o zoom útil escolhido.
- O tratamento fica restrito ao elemento real do mapa (não aos controles flutuantes) e ignora interações em marcadores e pop-ups, sem efeitos em comboios e navegação por código.
- Os listeners de zoom são removidos quando o mapa é desmontado. Testes unitários exercitam eventos de pinça, rolagem, teclado e remoção, além de validar que o controlador híbrido continua único.
- **Ainda não habilita gestos MapLibre independentes, rotação automática do mapa ou inclinação 3D**. O Leaflet continua controlando a câmera para que linhas, alertas e hit areas não se desalinhem. O trabalho para removê-lo será feito com migração conjunta e testes físicos de Android.

## Camada de previsão meteorológica MapLibre — PR #56

- As amostras reais da previsão de chuva e vento são desenhadas com marcadores nativos MapLibre na base vetorial, contendo temperatura, probabilidade de chuva, vento, horário e eventuais avisos.
- Cada ponto possui botão acessível e balão com fonte explícita **Open-Meteo — previsão, não radar ao vivo**. Informações de terceiros são exibidas como texto, sem HTML arbitrário. Coordenadas e valores inválidos não geram marcadores.
- Os marcadores de previsão só aparecem quando o usuário ativa **Mostrar previsão de chuva**. Atualizações alteram somente os marcadores relevantes, sem modificar o zoom e os demais pontos do mapa.
- A camada Leaflet permanece disponível em modo raster e se desliga quando os marcadores MapLibre são instalados; em fallback, usa as mesmas amostras válidas e evita horário `Invalid Date`.
- Esta PR reduz mais uma dependência visual de Leaflet, mas os gestos e a câmera ainda pertencem à ponte Leaflet–MapLibre. A substituição segura do adaptador ainda exige migração dos hitboxes de rotas alternativas e da interação do mapa.

## Seleção de rotas alternativas no MapLibre — PR #57

- As rotas rodoviárias alternativas verificadas pelo OSRM continuam aparecendo juntas, mas cada linha MapLibre contém agora o **ID correspondente ao trajeto**. Ao tocar numa rota, a interface consulta diretamente a geometria renderizada pelo MapLibre e seleciona somente um ID que realmente conste das alternativas recebidas.
- Na base vetorial, o mapa não precisa mais das polylines invisíveis Leaflet por cima das rotas. A posição tocada é projetada em pixels no canvas MapLibre e consultada com tolerância de 12 px, adequada ao toque.
- O mapa ainda usa **Leaflet como controlador da câmera e dos gestos**. O clique Leaflet apenas encaminha a posição ao mapa vetorial; não são ativados dois controladores de câmera simultâneos.
- No fallback raster, as alternativas continuam visíveis e selecionáveis pelas mesmas polylines Leaflet. Um toque sobre uma linha vetorial que seleciona rota não dispara também a ação de definir coordenadas do mapa.
- Esta etapa não inventa rotas, não muda a geometria de origem, não faz merge automático e não altera backend nem admin.

## Melhor desempenho nas rotas longas — PR #58

- Os pequenos marcadores decorativos do percurso (pontos intermediários) passam a usar **uma camada de círculos do MapLibre**, em vez de vários elementos Leaflet quando há WebGL disponível. Isso mantém zoom, rotas alternativas e acompanhamento GPS desacoplados da atualização dessas decorações.
- Tanto no MapLibre quanto no fallback Leaflet, a quantidade de pontos decorativos é limitada a **160 por trajeto**, escolhidos exclusivamente dentre as coordenadas reais devolvidas pelo roteador OSRM. Nenhum trecho de estrada ou localização é inventado, e a geometria da rota não é simplificada: a mudança afeta só as decorações visuais.
- Os pontos decorativos só aparecem na visualização de roteiros, sem poluir a navegação ativa. Não são botões nem áreas de toque, evitando disputa com gestos e com a seleção de rotas.
- O fallback raster continua usando os mesmos pontos reais, sem criar um marcador DOM a cada 3 vértices em viagens longas. A camada vetorial é removida corretamente ao trocar de estilo.
- Esta etapa **não habilita rotação/inclinação do mapa**: a câmera do mapa híbrido continua controlada pelo Leaflet até a migração conjunta de gestos e overlays.

## Marcadores de estabelecimentos sem piscadas — PR #59

- Na base vetorial MapLibre, marcadores de postos, pedágios e estabelecimentos deixam de ser **recriados em conjunto** a cada atualização de dados. Um controlador incremental identifica cada local pelo ID e categoria.
- A atualização isolada de coordenadas usa `Marker.setLngLat`; mudanças de preço aprovado, nome e dados visuais substituem somente o marcador correspondente. Os demais permanecem em tela, com o mesmo foco, estado de toque e sem comandar a câmera.
- O controlador é instalado uma vez por ciclo do mapa vetorial. Se o WebGL não estiver disponível, a versão Leaflet mantém os ícones, a visualização de preços e os comentários. Após instalar os pins MapLibre, as versões Leaflet são retiradas sem sobreposição.
- Botões **Sugerir preço**, comentários e acessibilidade continuam usando ações existentes. Valores são exibidos apenas com as regras atuais de preços aprovados; nenhum preço é inventado.
- Esta atualização melhora a fluidez dos marcadores durante a navegação e busca. **Não altera o backend, o painel administrativo, o contrato GPS ou o controle híbrido da câmera**. Rotação nativa do mapa continua condicionada à migração conjunta dos gestos e dos overlays.

## Trocar de rota sem perder os marcadores — PR #60

- Selecionar uma alternativa de percurso deixa de limpar/recriar todas as camadas de paradas turísticas, origem/destino, pontos de encontro e previsão do tempo no fallback Leaflet. As linhas do trajeto continuam atualizando normalmente.
- As camadas estáticas mantêm assinaturas independentes baseadas em seus próprios dados; quando um local muda, só a camada correspondente é atualizada.
- Na alternância entre MapLibre e Leaflet, os marcadores corretos aparecem sem duplicação. A geometria das rotas, suas cores e o zoom manual permanecem inalterados.
- Evita fechar balões/pop-ups de paradas e pontos de encontro ao escolher outro roteiro, com o intuito de melhorar a percepção de fluidez.
- Os testes cobrem troca de rota, atualização real de conteúdo, navegação e alternância vetor/raster. Backend e painel administrativo não são alterados.

## Alertas colaborativos sem piscadas — PR #61

- Alertas aprovados (buraco, veículo quebrado, radar, obstáculo, alagamento, policiamento e roubo) agora são reconciliados individualmente por ID no mapa MapLibre: atualizar uma ocorrência não recria os outros botões.
- O fallback Leaflet usa a mesma estratégia de atualização: uma nova ocorrência, a expiração de um alerta ou uma mudança de posição afetam somente os ícones envolvidos.
- Mudanças isoladas de localização utilizam `setLngLat` no MapLibre e `setLatLng` no Leaflet; mudança de categoria troca o ícone, e mudança de observação/horário mantém o elemento e atualiza o objeto usado no modal **Ainda continua lá?**.
- A seleção continua filtrando coordenadas inválidas, categorias desconhecidas, alertas não aprovados e alertas expirados. O backend continua exigindo GPS recente e veículo parado para confirmação. Sem HTML de terceiros no ícone.
- O controlador MapLibre é instalado uma vez por ciclo do mapa vetorial. Em falta de WebGL, os alertas continuam visíveis e interativos pelo fallback raster.
- Não altera API, moderação, backend, painel admin, regras de validade nem controle híbrido Leaflet–MapLibre da câmera.

## Câmera estável ao comparar rotas — PR #62

- Ao escolher entre rotas alternativas de um mesmo percurso OSRM, o mapa não altera o centro ou o zoom escolhido com pinça/arrasto. A rota selecionada é atualizada, mas o usuário mantém o enquadramento.
- O enquadramento automático permanece ao abrir um percurso novo, mudar origem/destino ou receber um conjunto realmente diferente de rotas. A ordem dos cards não redefine a câmera.
- Paradas turísticas, participantes, pontos de encontro e previsões atualizadas não forçam `fitBounds` nem anulam a exploração manual.
- A câmera segue pertencendo ao Leaflet no mapa híbrido, com MapLibre sincronizado, evitando giros de uma base separados de marcadores e linhas. Não altera GPS, backend, moderação ou painel administrativo.
