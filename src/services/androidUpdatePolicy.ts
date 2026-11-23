export type AndroidChannel = 'debug' | 'release';

export interface AndroidUpdatePolicy {
  minVersionCode: number;
  downloadUrl: string;
}

export function isAndroidChannel(value: unknown): value is AndroidChannel {
  return value === 'debug' || value === 'release';
}

export function isAndroidVersionCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parseAndroidUpdatePolicy(value: unknown): AndroidUpdatePolicy | null {
  if (!value || typeof value !== 'object') return null;
  const { minVersionCode, downloadUrl } = value as Partial<AndroidUpdatePolicy>;
  if (!isAndroidVersionCode(minVersionCode) || typeof downloadUrl !== 'string') return null;
  try {
    const url = new URL(downloadUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return { minVersionCode, downloadUrl: url.href };
  } catch {
    return null;
  }
}
