import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { openDatabase } from './db';
import { createApi } from './app';

const db = openDatabase();
const app = createApi({ db });
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('dist')));
  app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
}
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const server = app.listen(port, process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1', () => console.log(`Roteiro de Viagem: API disponível na porta ${port}`));
const close = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', close);
process.on('SIGINT', close);

