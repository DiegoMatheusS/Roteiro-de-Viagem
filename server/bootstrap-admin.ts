import { randomUUID } from 'node:crypto';
import type { FuelDatabase } from './db';

type InitialAccount = { email?: string; passwordHash?: string };

// Seed one privileged account only when there is no other active administrator.
// The inputs come only from private Railway environment variables, never from
// a public JSON file, an HTTP endpoint, or version-controlled credentials.
export function bootstrapInitialAdmin(
  db: FuelDatabase,
  { email: inputEmail, passwordHash }: InitialAccount,
): 'not-configured' | 'already-configured' | 'created' | 'promoted' {
  const email = inputEmail?.trim().toLowerCase();
  const hash = passwordHash?.trim();
  if (!email && !hash) return 'not-configured';
  if (!email || !hash ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180 ||
      !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash))
    throw new Error('Configuração da conta administrativa inicial inválida. Confira as variáveis privadas do Railway.');

  db.exec('BEGIN IMMEDIATE');
  try {
    const admin = db.prepare("SELECT id FROM users WHERE role='admin' AND blocked_at IS NULL AND deleted_at IS NULL LIMIT 1").get();
    if (admin) { db.exec('COMMIT'); return 'already-configured'; }

    const account = db.prepare('SELECT id,blocked_at,deleted_at FROM users WHERE email=?')
      .get(email) as { id: string; blocked_at: string | null; deleted_at: string | null } | undefined;
    if (account?.blocked_at || account?.deleted_at) {
      throw new Error('A conta selecionada está bloqueada ou excluída. Recuse a ativação automática.');
    }
    if (account) {
      db.prepare("UPDATE users SET password_hash=?,role='admin' WHERE id=?")
        .run(hash, account.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
      db.exec('COMMIT');
      return 'promoted';
    }
    db.prepare('INSERT INTO users(id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
      .run(randomUUID(), email, 'Administrador', hash, 'admin', new Date().toISOString());
    db.exec('COMMIT');
    return 'created';
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
