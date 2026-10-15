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

Acesse `/admin` no mesmo endereço do aplicativo, pelo computador ou celular. A área tem páginas para **Preços de combustíveis**, estabelecimentos/unidades, usuários, comentários, denúncias e histórico de ações. O frontend do administrador é carregado separadamente do aplicativo. Cada API administrativa verifica a sessão e a permissão no servidor.

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
