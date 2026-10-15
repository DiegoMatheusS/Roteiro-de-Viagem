import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import type { FuelDatabase } from './db';

const scryptAsync = promisify(scrypt);

/** Executado somente por comando de manutencao, nunca exposto como rota HTTP. */
export async function createAdministrator(db: FuelDatabase, rawEmail: string, password: string) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180)
    throw new Error('Informe um e-mail valido.');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128)
    throw new Error('A senha deve ter entre 10 e 128 caracteres.');
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
    throw new Error('Ja existe uma conta para este e-mail. Para autorizar a conta existente, use npm run admin -- email.');

  const salt = randomBytes(16).toString('hex');
  const hashed = (await scryptAsync(password, salt, 64) as Buffer).toString('hex');
  const id = randomUUID();
  db.prepare('INSERT INTO users(id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
    .run(id, email, 'Administrador', `${salt}:${hashed}`, 'admin', new Date().toISOString());
  return { id, email };
}
