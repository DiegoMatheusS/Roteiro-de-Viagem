import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { openDatabase } from './db';
import { createApi } from './app';
import { bootstrapInitialAdmin } from './bootstrap-admin';

const db = openDatabase();
const bootstrap = bootstrapInitialAdmin(db, {
  email: process.env.RDV_BOOTSTRAP_ADMIN_EMAIL,
  passwordHash: process.env.RDV_BOOTSTRAP_ADMIN_HASH,
});
if (bootstrap === 'created' || bootstrap === 'promoted')
  console.log('Conta administrativa inicial criada no banco. Remova as variáveis de bootstrap após a publicação.');
const app = createApi({ db });
const feedbackMailTimer=setInterval(()=>{void app.locals.feedbackMail.flush().catch(()=>{});},60_000);
feedbackMailTimer.unref();void app.locals.feedbackMail.flush().catch(()=>{});
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('dist')));
  app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
}
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const server = app.listen(port, process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1', () => console.log(`Roteiro de Viagem: API disponível na porta ${port}`));
const close = () => server.close(() => { clearInterval(feedbackMailTimer);app.locals.feedbackMail.close();db.close(); process.exit(0); });
process.on('SIGTERM', close);
process.on('SIGINT', close);

