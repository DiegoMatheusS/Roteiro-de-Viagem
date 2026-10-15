# Site de administracao separado do aplicativo

Dois projetos **Cloudflare Pages**, uma unica API e um unico banco SQLite persistente no Railway:

- Aplicativo publico: `https://roteirodeviagem.pages.dev`
- Admin separado (nome sugerido): `https://adminroteirodeviagem.pages.dev`
- API e banco: servico `roteiro-api` no Railway

O admin é um frontend independente compilado a partir de `admin.html`, `src/admin-main.tsx` e `vite.admin.config.ts`.
Ele **nao inclui as telas de viagens** e exibe apenas login e painel administrativo. Nao oferece cadastro de contas nem acesso publico as acoes.
O backend continua autorizando cada operacao por sessao e permissao `admin` — esconder a interface nao substitui essa verificacao.

## Publicar

1. No GitHub, abra **Actions > Gerar site administrativo separado**. O workflow gera `roteiro-admin-cloudflare.zip` como artifact.
2. Em **Cloudflare Pages**, crie **outro** projeto por **Direct Upload**, separado do projeto do aplicativo. Sugestao: `adminroteirodeviagem`.
3. Envie o ZIP do artifact (com `index.html`, `assets/`, `_worker.js` e `_routes.json`). Se o upload da Cloudflare solicitar uma pasta em vez de ZIP, extraia e envie o conteudo, sem uma pasta extra no nivel raiz.
4. No projeto Pages do admin, adicione a variavel de execucao `RDV_BACKEND_ORIGIN` com o HTTPS publico do servico `roteiro-api` no Railway e o segredo de execucao `WEB_PROXY_SECRET`. Use o **mesmo** segredo com pelo menos 32 caracteres no Pages do app, no Pages do admin e no backend Railway. **Nao** coloque segredo em `VITE_*`, nem no ZIP.
5. No Railway, configure `PUBLIC_APP_URL=https://roteirodeviagem.pages.dev` e `PUBLIC_ADMIN_URL=https://adminroteirodeviagem.pages.dev` com os enderecos finais exatos (sem barra ao fim). Mantenha `TRUST_PROXY_HOPS=1` e o volume persistente do banco. Publique as configuracoes.
6. Crie sua conta no aplicativo publico (se ainda nao existe) e autorize esse email no banco do Railway executando dentro do container **de producao**, nao em seu computador local:
   `npm run admin -- email-da-conta`
7. Abra a URL do admin em uma janela separada, entre com a conta autorizada e teste cadastrar/editar um estabelecimento. Confirme a publicacao no app. Nao ha senha nem administrador padrao.

No admin, a criacao/edicao de estabelecimentos, tarifas e precos aprovados e gravada na API comum. O app carrega os dados dessa API: **nao e preciso republicar o aplicativo** para mostrar alteracoes aprovadas.
Dados pendentes de revisao nao sao publicados automaticamente.

O workflow de producao do frontend publico continua independente. Cada ZIP deve ser publicado no projeto Pages correspondente.
Projetos Pages criados por upload manual nao recebem atualizacoes automaticas do GitHub.
