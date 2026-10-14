import { spawnSync } from 'node:child_process';
const value = process.env.RDV_API_URL;
if (!value) throw new Error('Defina RDV_API_URL com a origem HTTPS do backend antes de preparar o Android.');
const url = new URL(value);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('RDV_API_URL deve ser uma origem HTTPS, sem caminho ou credenciais.');
for (const [cmd, args] of [['npm', ['run', 'build']], ['npx', ['cap', 'sync', 'android']]]) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
