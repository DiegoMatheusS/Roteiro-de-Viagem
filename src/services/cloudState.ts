import type { FuelUser } from '../types/fuel';
import { fuelApi, FuelApiError } from './fuelApi';
import { storageService, type TravelerSnapshot } from './storageService';

interface AccountState { state: TravelerSnapshot | null; revision: number; updatedAt: string | null }
type SyncState = 'loading' | 'synced' | 'pending' | 'error' | 'conflict' | 'guest';
let activeAccount: FuelUser | null = null;
let generation = 0;
let revision = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let blocked = false;
let initialized = false;
let onStatus: ((state: SyncState, message?: string) => void) | null = null;
const key = (accountId: string, suffix: string) => `rdv_cloud_v1_${accountId}_${suffix}`;
function status(state: SyncState, message?: string) { onStatus?.(state, message); }
function cancel() {
  generation++;
  if (timer) clearTimeout(timer);
  timer = null; activeAccount = null; blocked = false; initialized = false; inFlight = false; revision = 0;
  storageService.setChangeListener(null);
}
function schedule() {
  if (!activeAccount || blocked) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void flush(); }, 850);
}
async function flush() {
  if (!activeAccount || blocked || inFlight) return;
  const token = generation, account = activeAccount;
  const snapshot = storageService.getSnapshot(account.displayName);
  const serialized = JSON.stringify(snapshot);
  inFlight = true;
  try {
    const result = await fuelApi<{ revision: number }>('/me/state', {
      method: 'PUT', body: JSON.stringify({ state: snapshot, revision })
    });
    if (token !== generation) return;
    revision = result.revision;
    localStorage.setItem(key(account.id, 'revision'), String(revision));
    if (JSON.stringify(storageService.getSnapshot(account.displayName)) === serialized) {
      localStorage.removeItem(key(account.id, 'dirty'));
      status('synced');
    } else {
      localStorage.setItem(key(account.id, 'dirty'), 'true');
      status('pending');
      schedule();
    }
  } catch (error) {
    if (token !== generation) return;
    const conflict = error instanceof FuelApiError && error.status === 409;
    if (conflict) blocked = true;
    status(conflict ? 'conflict' : 'error', (error as Error).message);
  } finally {
    if (token === generation) inFlight = false;
  }
}

export const cloudState = {
  stop() { cancel(); onStatus = null; },
  async connect(account: FuelUser | null, notify: (state: SyncState, message?: string) => void): Promise<void> {
    cancel();
    onStatus = notify;
    storageService.setScope(account?.id || null);
    if (!account) { status('guest'); return; }
    activeAccount = account;
    const token = generation;
    status('loading');
    try {
      const remote = await fuelApi<AccountState>('/me/state');
      if (token !== generation) return;
      const localDirty = localStorage.getItem(key(account.id, 'dirty')) === 'true';
      const localRev = Number(localStorage.getItem(key(account.id, 'revision')) || '0');
      revision = remote.revision;
      initialized = true;
      if (localDirty && localRev !== remote.revision) {
        blocked = true;
        status('conflict', 'Esta conta foi alterada em outro dispositivo. Os dados locais não foram apagados. Entre em contato com o suporte para conciliar as versões.');
        return;
      }
      if (!localDirty) {
        if (remote.state) storageService.replaceSnapshot(remote.state);
        else storageService.resetScope(account.displayName);
        localStorage.setItem(key(account.id, 'revision'), String(remote.revision));
      }
      // The account is hydrated before changes are watched; never send blank state on initial load.
      storageService.setChangeListener(() => {
        localStorage.setItem(key(account.id, 'dirty'), 'true');
        status('pending');
        schedule();
      });
      if (localDirty) { status('pending'); schedule(); }
      else status('synced');
    } catch (error) {
      if (token !== generation) return;
      status('error', 'Não foi possível carregar os dados do servidor. Confira a conexão e tente novamente.');
      // Do not overwrite or upload cached data when the authoritative state could not be loaded.
    }
  },
  async resolveConflict(preference: 'server' | 'device'): Promise<void> {
    if (!activeAccount || !blocked) return;
    const account = activeAccount, token = generation;
    try {
      const remote = await fuelApi<AccountState>('/me/state');
      if (token !== generation) return;
      revision = remote.revision;
      if (preference === 'server') {
        // Preserve the unsent local snapshot before accepting a newer server copy.
        localStorage.setItem(key(account.id, 'conflict_backup'), JSON.stringify(storageService.getSnapshot(account.displayName)));
        if (remote.state) storageService.replaceSnapshot(remote.state);
        else storageService.resetScope(account.displayName);
        localStorage.removeItem(key(account.id, 'dirty'));
        localStorage.setItem(key(account.id, 'revision'), String(revision));
        blocked = false;
        storageService.setChangeListener(() => {
          localStorage.setItem(key(account.id, 'dirty'), 'true');
          status('pending'); schedule();
        });
        status('synced');
      } else {
        // Explicit user choice to replace cloud state; old browser cache is not discarded.
        localStorage.setItem(key(account.id, 'revision'), String(revision));
        localStorage.setItem(key(account.id, 'dirty'), 'true');
        blocked = false;
        storageService.setChangeListener(() => {
          localStorage.setItem(key(account.id, 'dirty'), 'true');
          status('pending'); schedule();
        });
        status('pending');
        schedule();
      }
    } catch (error) { status('error', (error as Error).message); }
  },
  async retry(): Promise<void> {
    if (!activeAccount || blocked || inFlight) return;
    const account = activeAccount;
    if (!initialized) {
      const notify = onStatus;
      if (notify) await this.connect(account, notify);
      return;
    }
    if (localStorage.getItem(key(account.id, 'dirty')) === 'true') await flush();
    else {
      const notify = onStatus;
      if (notify) await this.connect(account, notify);
    }
  }
};
