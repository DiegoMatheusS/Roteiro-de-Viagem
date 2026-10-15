import { createPublicKey, verify } from 'node:crypto';

export type GoogleIdentity = { sub: string; email: string; name: string; hostedDomain?: string };

// Google is authoritative for Gmail addresses and for a verified hosted domain.
// A third-party mailbox with only email_verified=true is not sufficient for automatic account linking.
export function canAutoLinkGoogleIdentity(identity: GoogleIdentity): boolean {
  const domain = identity.email.split('@')[1]?.toLowerCase();
  return domain === 'gmail.com' || domain === 'googlemail.com' ||
    (typeof identity.hostedDomain === 'string' && identity.hostedDomain.toLowerCase() === domain);
}
type GoogleKey = JsonWebKey & { kid: string; kty: string; alg?: string; use?: string };
let cached: { keys: GoogleKey[]; expiresAt: number } | null = null;

function decodePart(part: string): any {
  const decoded = Buffer.from(part, 'base64url').toString('utf8');
  return JSON.parse(decoded);
}

export async function verifyGoogleCredential(
  credential: unknown,
  clientId = process.env.GOOGLE_CLIENT_ID,
  keyFetch: typeof fetch = fetch
): Promise<GoogleIdentity> {
  if (!clientId) throw new Error('GOOGLE_LOGIN_NOT_CONFIGURED');
  if (typeof credential !== 'string' || credential.length > 8192) throw new Error('INVALID_GOOGLE_CREDENTIAL');
  const segments = credential.split('.');
  if (segments.length !== 3 || segments.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('INVALID_GOOGLE_CREDENTIAL');

  let header: any, payload: any;
  try { header = decodePart(segments[0]); payload = decodePart(segments[1]); }
  catch { throw new Error('INVALID_GOOGLE_CREDENTIAL'); }
  const now = Math.floor(Date.now() / 1000);
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 150 ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(payload?.iss) ||
    payload?.aud !== clientId ||
    typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 255 ||
    typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
    payload.email.length > 180 || payload.email_verified !== true ||
    !Number.isInteger(payload.exp) || payload.exp <= now ||
    !Number.isInteger(payload.iat) || payload.iat > now + 60 ||
    payload.exp - payload.iat > 86400) throw new Error('INVALID_GOOGLE_CREDENTIAL');

  if (!cached || cached.expiresAt < Date.now()) {
    const response = await keyFetch('https://www.googleapis.com/oauth2/v3/certs', {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('GOOGLE_KEYS_UNAVAILABLE');
    const jwks = await response.json() as { keys?: GoogleKey[] };
    if (!Array.isArray(jwks.keys) || jwks.keys.length < 1 || jwks.keys.length > 20) throw new Error('GOOGLE_KEYS_UNAVAILABLE');
    cached = { keys: jwks.keys, expiresAt: Date.now() + 60 * 60000 };
  }

  const key = cached.keys.find(value => value.kid === header.kid && value.kty === 'RSA' &&
    (!value.alg || value.alg === 'RS256') && (!value.use || value.use === 'sig'));
  if (!key) throw new Error('INVALID_GOOGLE_CREDENTIAL');
  let valid = false;
  try {
    valid = verify('RSA-SHA256', Buffer.from(segments[0] + '.' + segments[1]),
      createPublicKey({ key: key as any, format: 'jwk' }), Buffer.from(segments[2], 'base64url'));
  } catch { throw new Error('INVALID_GOOGLE_CREDENTIAL'); }
  if (!valid) throw new Error('INVALID_GOOGLE_CREDENTIAL');

  const identity: GoogleIdentity = { sub: payload.sub, email: payload.email.trim().toLowerCase(),
    name: String(payload.name || payload.given_name || payload.email.split('@')[0]).trim().slice(0, 50) || 'Viajante' };
  if (typeof payload.hd === 'string' && payload.hd.length > 0 && payload.hd.length <= 180)
    identity.hostedDomain = payload.hd.trim().toLowerCase();
  return identity;
}
