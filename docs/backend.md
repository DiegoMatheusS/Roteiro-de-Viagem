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
