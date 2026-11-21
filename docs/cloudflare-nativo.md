# RUAVO no Cloudflare

O backend possui um destino nativo para Cloudflare Workers. As rotas e regras de
contas, sessões, moderação, preços, alertas, viagens e Comboio são compartilhadas
com o servidor Node. O aplicativo e o mapa não precisam ser redesenhados.

| Componente | Destino |
| --- | --- |
| Site público | Cloudflare Pages, build `npm run build`, pasta `dist` |
| Site administrativo | Projeto Pages separado já existente |
| API | Worker `ruavo-api`, configuração `wrangler.worker.jsonc` |
| Contas, locais, alertas e viagens | SQLite persistente de um Durable Object |
| Fotos moderadas | Mesmo banco persistente, limite de 1 MiB por foto |
| Processamento de fotos | Binding Cloudflare Images, JPEG até 1600 px, qualidade 80 |
| CSV público original dos radares | R2, bucket `ruavo-radar-sources` |
| Atualizações mensais e fila de e-mail | Alarmes persistentes do Durable Object |

## Antes de publicar

Recupere o backup de `roteiro.sqlite` e os dados antigos antes de excluir qualquer
armazenamento remanescente. Um servidor ou volume excluído não é restaurado pelo
GitHub: o repositório guarda o código, não os cadastros ou as contribuições. A nova
instalação sem importação começa com o banco vazio. Radares públicos podem ser
reimportados da fonte original.

SQLite/Durable Objects, R2 e Images têm cotas e cobranças próprias. Confira as
condições da conta antes de habilitar os bindings. O teste local e a verificação
de pacote não publicam serviços nem precisam de credenciais Cloudflare.

## Verificação sem conta Cloudflare

```bash
npm ci
npm run lint
npm test
npm run build
npm run cloudflare:check
npm run test:cloudflare
```

O teste do runtime usa uma pasta temporária e dados fictícios. Reinicia o processo
e verifica a persistência da conta/sessão, CSRF, permissões administrativas e URLs
absolutas de trânsito para o Android. Os testes de regressão também comparam os
pixels do trânsito com o codec Node e verificam rollback e remoção de metadados
das fotos. O teste não consulta trânsito real com uma chave fictícia.

## Publicar o backend

Com uma conta Cloudflare autorizada, habilite Images e R2 e crie o bucket:

```bash
npx wrangler r2 bucket create ruavo-radar-sources
```

Defina em **Workers > ruavo-api > Settings > Variables and Secrets**, ou com
`wrangler secret put --config wrangler.worker.jsonc NOME`:

| Variável | Uso |
| --- | --- |
| `PUBLIC_APP_URL` | Origem HTTPS exata do site público, sem barra final |
| `PUBLIC_ADMIN_URL` | Origem HTTPS do site administrativo separado |
| `WEB_PROXY_SECRET` | Segredo aleatório de pelo menos 32 caracteres, igual nos sites Pages |
| `TOMTOM_TRAFFIC_API_KEY` | Chave do provedor de trânsito, somente no backend |
| `GOOGLE_CLIENT_ID` | Client ID Web já usado pelo login Google |
| `RESEND_API_KEY`, `RDV_FEEDBACK_EMAIL_FROM`, `RDV_FEEDBACK_EMAIL_TO` | Configuração existente de envio de relatos por e-mail |
| `RDV_BOOTSTRAP_ADMIN_EMAIL`, `RDV_BOOTSTRAP_ADMIN_HASH` | Ativação inicial privada do administrador, conforme o procedimento existente |

O Worker recusa a API com 503 até que `WEB_PROXY_SECRET` e `PUBLIC_APP_URL`
estejam configurados. Em uma primeira publicação, configure esses valores
privados com Wrangler antes do deploy. Nunca salve segredos neste arquivo,
em `.env` versionado, no frontend ou no APK.

```bash
npm run cloudflare:deploy
```

As migrações do Wrangler criam o namespace SQLite persistente. O nome do objeto
`ruavo-production` é estável: não o altere para atualizar o aplicativo, pois um novo
nome selecionaria outro banco. O Worker não usa disco local como armazenamento
permanente. Transações usam o rollback do SQLite/Durable Objects.

O CSV verificado dos radares é salvo no R2 antes da troca transacional da base.
Falhas preservam a geração anterior. Alarmes consultam a data mensal salva no
banco e retomam as tentativas de e-mail; não dependem de um processo sempre ativo.

## Restaurar o backup do Railway

Gere o arquivo de restauração a partir de uma cópia privada do SQLite:

```bash
node --import tsx scripts/export-cloudflare-restore.mjs roteiro.sqlite restauracao.json
```

Envie o JSON para o bucket privado `ruavo-radar-sources`. No Worker
`ruavo-api`, adicione a variável de execução `RUAVO_RESTORE_OBJECT` em
**Production**, com o nome exato do arquivo enviado ao bucket.

Salve a variável e acesse `/api/health`. O Worker importa o backup em uma
transação e responde com `{"ok":true}` após concluir. A restauração exige
um banco sem dados do app e mantém o catálogo de radares já sincronizado.
Para usar uma instância nova, configure também `RUAVO_DATABASE_NAME` no mesmo
salvamento. Use esse nome no Data Studio durante a conferência e preserve a
variável para continuar usando a instância restaurada.

Confira as contagens e a tabela `ruavo_restore` no Data Studio antes de
trocar a origem dos sites. Remova `RUAVO_RESTORE_OBJECT` após validar o
banco. Mantenha o arquivo de restauração em acesso privado.

## Ligar os sites e o Android

1. Nos projetos Pages público e administrativo, configure `RDV_BACKEND_ORIGIN`
   com a origem HTTPS real do Worker e o mesmo `WEB_PROXY_SECRET` do backend.
2. Publique novamente os sites. O Worker do site público mantém o bloqueio de
   `/admin` e `/api/admin/*`; o site administrativo continua separado.
3. Atualize a variável GitHub `RDV_API_URL` com a origem HTTPS real do Worker.
   Gere o APK de `main` somente depois de validar essa origem. O APK antigo
   continua apontando para o Railway e precisa ser atualizado.
4. Verifique `/api/health`, login/logout, cadastro, locais, fotos, alertas,
   moderação, Comboio entre aparelhos, exportação dos radares e trânsito real.
   Para o trânsito, confirme `/api/traffic/status` com `available:true` e o
   carregamento dos tiles reais; mapa-base carregado sozinho não comprova isso.

O endpoint de trânsito informa URLs absolutas do Worker, incluindo quando o
Android consulta a API diretamente. A chave TomTom permanece privada. Configure
a nova origem no OAuth Web quando necessário; pacote e certificado Android
permanecem os mesmos.

## Referências oficiais

- [Express em Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)
- [SQLite persistente em Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Images em Workers](https://developers.cloudflare.com/images/optimization/binding/)
- [Cotas de Workers](https://developers.cloudflare.com/workers/platform/limits/)
- [Preços e cotas de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Preços e cotas de R2](https://developers.cloudflare.com/r2/pricing/)
