import { spawnSync } from 'node:child_process';
import {apiOrigin} from './android-config.mjs';
apiOrigin(process.env.RDV_API_URL);
for (const [cmd, args] of [['npm', ['run', 'build']], ['npx', ['cap', 'sync', 'android']]]) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
