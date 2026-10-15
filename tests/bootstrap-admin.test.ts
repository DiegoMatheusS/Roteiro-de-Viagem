import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { openDatabase } from '../server/db';
import { bootstrapInitialAdmin } from '../server/bootstrap-admin';

const makeHash = (password: string) => {
  const salt = 'e3fbc04f9c9f1a6bad558de037c851fc';
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
test('seed admin: variaveis ausentes nao modificam o banco, hash scrypt nao vira texto puro', () => {
  const db = openDatabase(':memory:');
  const hash = makeHash('Temporary-admin-password-abc');
  try {
    assert.equal(bootstrapInitialAdmin(db, {}), 'not-configured');
    assert.equal(bootstrapInitialAdmin(db, { email: ' FIRST@EXAMPLE.invalid ', passwordHash: hash }), 'created');
    const created = db.prepare('SELECT email,password_hash,role FROM users').get() as any;
    assert.equal(created.email, 'first@example.invalid');
    assert.equal(created.role, 'admin');
    assert.equal(created.password_hash, hash);
    assert.ok(!created.password_hash.includes('Temporary-admin-password-abc'));
    assert.equal(bootstrapInitialAdmin(db, { email: 'another@example.invalid', passwordHash: makeHash('other-password-xyz') }), 'already-configured');
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM users').get() as any).count, 1);
    assert.equal((db.prepare('SELECT email FROM users').get() as any).email, 'first@example.invalid');
  } finally { db.close(); }
});
test('seed admin: conta existente e promovida apenas quando nao ha admins, sem perder seus dados', () => {
  const db = openDatabase(':memory:');
  try {
    const existingId = 'existing-user';
    db.prepare('INSERT INTO users(id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
      .run(existingId, 'existing@example.invalid', 'Viajante', makeHash('old-password-existing'), 'user', new Date().toISOString());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run('deadbeef', existingId, new Date(Date.now() + 3600000).toISOString());
    const incomingHash = makeHash('new-temporary-password');
    assert.equal(bootstrapInitialAdmin(db, { email: 'existing@example.invalid', passwordHash: incomingHash }), 'promoted');
    const upgraded = db.prepare('SELECT id,display_name,password_hash,role FROM users WHERE email=?').get('existing@example.invalid') as any;
    assert.equal(upgraded.id, existingId);
    assert.equal(upgraded.display_name, 'Viajante');
    assert.equal(upgraded.password_hash, incomingHash);
    assert.equal(upgraded.role, 'admin');
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as any).count, 0);
  } finally { db.close(); }
});
test('seed admin: hash ou email invalidos nao gravam no banco', () => {
  const db = openDatabase(':memory:');
  try {
    assert.throws(() => bootstrapInitialAdmin(db, { email: 'invalid@example.invalid', passwordHash: 'plain-text-password' }), /inválida/);
    assert.throws(() => bootstrapInitialAdmin(db, { email: 'not-email', passwordHash: makeHash('password') }), /inválida/);
    assert.throws(() => bootstrapInitialAdmin(db, { email: 'valid@example.invalid' }), /inválida/);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM users').get() as any).count, 0);
  } finally { db.close(); }
});
