# Frontend no Cloudflare Pages e backend no Railway

O frontend e o painel `/admin` podem ser publicados no Cloudflare Pages. Contas, sessões, moderação, fotos, viagens e Comboio continuam na API do Railway e no volume persistente. O Android acessa a API HTTPS do Railway diretamente.

O build inclui `_worker.js` em modo avançado e `_routes.json`. Somente `/api` e `/api/*` passam pelo Worker; os demais arquivos e a navegação SPA são servidos pelo Pages. O Worker encaminha JSON, cookies, uploads e fotos sem cache. As chamadas do navegador continuam na mesma origem do site, preservando cookies Secure, HttpOnly e SameSite=Strict. Não configure uma URL de API no JavaScript do navegador.

## Configuração

1. Crie um projeto **Pages** novo e isolado para o Roteiro de Viagem. Para atualizações automáticas, conecte `DiegoMatheusS/Roteiro-de-Viagem`, branch `main`, build `npm run build`, saída `dist` e `NODE_VERSION=24`.
2. Configure `RDV_BACKEND_ORIGIN=https://roteiro-api-production.up.railway.app` no Pages (o padrão já está no `wrangler.jsonc`).
3. Gere uma senha aleatória com pelo menos 32 caracteres. Configure o mesmo `WEB_PROXY_SECRET` como segredo de execução no Pages e como variável no serviço `roteiro-api` do Railway. Nunca use prefixo `VITE_`, arquivo público ou variável de build exposta ao navegador para esse segredo.
4. Depois de conhecer a origem HTTPS do Pages ou seu domínio próprio, configure `PUBLIC_APP_URL` no Railway com essa origem exata, sem caminho ou barra final, e publique a configuração. Isso autoriza as escritas do site e aponta os links compartilhados para o frontend.
5. Mantenha `TRUST_PROXY_HOPS=1` no Railway. O backend só usa o IP encaminhado pelo Worker se a chave de proxy for válida; pedidos diretos e nativos seguem a configuração normal do Railway. Não aumente a confiança em cabeçalhos arbitrários para dois proxies.
6. Configure o segredo apenas no ambiente de produção do Pages. Previews não devem escrever no banco de produção. Sem o segredo, a API pelo Pages retorna indisponível; o site estático ainda pode abrir.

Após configurar ou trocar variáveis do Pages, faça um novo deployment. Depois de publicar, confira `/api/health`, cadastro, login, logout, fotos e `/admin`: visitante recebe 401 na API; conta comum recebe 403; apenas uma conta promovida por `npm run admin -- email-da-conta` acessa as operações administrativas. Não há administrador ou senha padrão.

## Envio de um build pronto

Execute `npm ci` e `npm run build`. O conteúdo de `dist` também pode ser enviado como ZIP pelo painel de Direct Upload do Pages, incluindo `_worker.js` e `_routes.json`. Não envie `node_modules`, banco de dados, `.env`, o keystore Android nem suas senhas. As mesmas variáveis de execução e o segredo acima continuam necessários. Projetos criados por Direct Upload não podem ser convertidos para integração Git; prefira conectar o Git se deseja atualizações automáticas.

Referências oficiais: [Pages em modo avançado](https://developers.cloudflare.com/pages/functions/advanced-mode/), [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [configuração](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
