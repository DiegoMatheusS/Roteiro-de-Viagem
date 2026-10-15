# Site de administracao separado do aplicativo

Dois projetos **Cloudflare Pages**, uma unica API e um unico banco SQLite persistente no Railway:

- Aplicativo publico: `https://roteirodeviagem.pages.dev`
- Admin separado (nome sugerido): `https://adminroteirodeviagem.pages.dev`
- API e banco: servico `roteiro-api` no Railway

O admin é um frontend independente compilado a partir de `admin-entry.html`, `src/admin-main.tsx` e `vite.admin.config.ts`.
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


## Criar um administrador diretamente no banco do Railway (sem cadastro publico)

O servidor usa SQLite no volume persistente `/app/data`. A tabela `users` nao armazena a senha em texto simples: o campo `password_hash` usa `salt:scrypt`.
Nunca insira senhas puras via SQL, GitHub, variaveis persistentes ou mensagens.

No seu computador, instale e autentique a [Railway CLI](https://docs.railway.com/cli/ssh), caso ainda nao tenha feito.
Conecte ao container de **producao**:

```bash
railway ssh --project de1e8031-2c56-4d54-bcc5-23518ffe785c --service roteiro-api --environment production
```

Dentro do terminal remoto:

```bash
npm run admin:create -- seu-email@exemplo.com
```

Informe e confirme a senha quando solicitado: nao havera eco no terminal. O comando gera salt aleatorio, aplica scrypt compativel com o login normal e grava `role='admin'` diretamente no SQLite, **sem habilitar uma API de bootstrap**.
Se a conta ja existir, o comando a preserva e falha. Para promover uma conta existente sem trocar a senha, use `npm run admin -- seu-email@exemplo.com`.

Sempre execute dentro do container que tem o volume montado, e nunca em um Codespace ou computador sem o mesmo banco. Evite divulgar senha ou executa-la como argumento (fica no historico do shell).

## Configurações -> Alterar senha

A aba **Configurações** do painel oferece o formulario com senha atual, nova senha e confirmação.
A API autenticada `POST /api/admin/change-password`:
- exige sessão `admin`, senha atual correta e confirmação de 10 a 128 caracteres;
- limita tentativas, utiliza salt novo com scrypt e não expõe nem registra a senha;
- revoga **todas** as sessões da conta após a troca, incluindo outros dispositivos;
- limpa o cookie da sessão e exige novo login.

Depois de alterar esta funcionalidade no repositório, publique **ambos**: o backend atualizado do Railway (GitHub conectado) e o novo ZIP de build do admin em **Cloudflare Pages → Deployments → Create deployment**. Para o projeto que já usa `roteirodeviagem.pages.dev` apenas como painel, publique o ZIP administrativo no **mesmo projeto**, substituindo o frontend anterior. Não é necessário criar outro Pages nem alterar o banco.

Nota: o painel não cria automaticamente uma conta administrativa. O primeiro usuário deve ser criado com `npm run admin:create -- email` no Railway, ou uma conta já existente deve ser promovida com `npm run admin -- email`. Não exponha senhas em chat ou em arquivos de configuração.
