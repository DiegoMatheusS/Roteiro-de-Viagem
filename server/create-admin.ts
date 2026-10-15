import 'dotenv/config';
import * as readline from 'node:readline';
import { openDatabase } from './db';
import { createAdministrator } from './admin-account';

function readHiddenLine(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Execute em terminal interativo do Railway. Nao passe a senha por argumento nem a salve nas variaveis.');
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let input = '';
    const wasRaw = Boolean(process.stdin.isRaw);
    readline.emitKeypressEvents(process.stdin);
    const finish = (error?: Error) => {
      process.stdin.removeListener('keypress', handleKey);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(input);
    };
    const handleKey = (value: string, key: readline.Key) => {
      if (key?.ctrl && key.name === 'c') return finish(new Error('Operacao cancelada.'));
      if (key?.name === 'return' || key?.name === 'enter') return finish();
      if (key?.name === 'backspace') {
        input = Array.from(input).slice(0, -1).join('');
        return;
      }
      if (key?.ctrl || key?.meta || !value || value.startsWith('\x1b')) return;
      if (input.length + value.length <= 128) input += value;
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', handleKey);
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || process.argv.length > 3) {
    console.error('Uso: npm run admin:create -- email@exemplo.com');
    process.exitCode = 1;
    return;
  }
  const db = openDatabase();
  try {
    // Confere a conta antes de solicitar qualquer senha.
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
      throw new Error('Conta ja existe. Use npm run admin -- email para conceder a permissao sem trocar a senha.');
    }
    const password = await readHiddenLine('Nova senha (oculta, minimo 10 caracteres): ');
    const confirmation = await readHiddenLine('Confirme a senha (oculta): ');
    if (password !== confirmation) throw new Error('As senhas nao coincidem. Nenhuma conta foi criada.');
    const result = await createAdministrator(db, email, password);
    console.log(`Administrador criado: ${result.email}. A senha nao foi exibida ou salva em texto simples.`);
  } finally {
    db.close();
  }
}

void main().catch(error => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
