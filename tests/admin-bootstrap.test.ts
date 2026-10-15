import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { openDatabase } from '../server/db';
import { createAdministrator } from '../server/admin-account';

test('admin via banco: senha scrypt compatível com login, sem armazenamento em texto simples', async () => {
  const db = openDatabase(':memory:');
  try {
    const result = await createAdministrator(db, '  OWNER@EXAMPLE.COM ', 'Senha!ForteDeTeste123');
    assert.equal(result.email, 'owner@example.com');
    const row = db.prepare('SELECT email,password_hash,role FROM users WHERE id=?').get(result.id) as {
      email: string; password_hash: string; role: string;
    };
    assert.equal(row.email, 'owner@example.com');
    assert.equal(row.role, 'admin');
    assert.ok(!row.password_hash.includes('Senha!ForteDeTeste123'));
    const [salt, expected] = row.password_hash.split(':');
    assert.match(salt, /^[a-f\d]{32}$/);
    assert.equal(scryptSync('Senha!ForteDeTeste123', salt, 64).toString('hex'), expected);
    await assert.rejects(createAdministrator(db, result.email, 'Senha!ForteDeTeste123'), /Ja existe/);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count, 1);
    await assert.rejects(createAdministrator(db, 'ruim', 'Senha!ForteDeTeste123'), /e-mail valido/);
    await assert.rejects(createAdministrator(db, 'novo@example.com', '123'), /10 e 128/);
  } finally {
    db.close();
  }
});
