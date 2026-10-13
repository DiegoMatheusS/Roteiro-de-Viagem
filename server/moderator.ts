import 'dotenv/config';
import { openDatabase } from './db';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) { console.error('Uso: npm run moderator -- email-da-conta'); process.exit(1); }
const db = openDatabase();
const result = db.prepare('UPDATE users SET role=? WHERE email=?').run('moderator', email);
db.close();
if (!result.changes) { console.error('Conta não encontrada. Cadastre a conta antes de promover.'); process.exit(1); }
console.log('Conta promovida para moderação.');
