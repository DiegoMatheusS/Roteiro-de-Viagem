import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { verifyGoogleCredential } from '../server/googleAuth';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const clientId = 'test-client.apps.googleusercontent.com';
const jwk = publicKey.export({ format: 'jwk' });
const mockFetch = (async () => Response.json({ keys: [{ ...jwk, kid: 'test-key-1', kty: 'RSA', use: 'sig', alg: 'RS256' }] })) as typeof fetch;

function credential(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key-1', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com', aud: clientId,
    sub: 'google-test-user-123', email: 'traveler@example.com', email_verified: true,
    name: 'Test Traveler', iat: now, exp: now + 3600, ...overrides
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}

test('Google login checks Google signature, issuer, audience and expiry', async () => {
  const identity = await verifyGoogleCredential(credential(), clientId, mockFetch);
  assert.deepEqual(identity, { sub: 'google-test-user-123', email: 'traveler@example.com', name: 'Test Traveler' });
  await assert.rejects(verifyGoogleCredential(credential({ aud: 'attacker-client' }), clientId, mockFetch), /INVALID_GOOGLE_CREDENTIAL/);
  await assert.rejects(verifyGoogleCredential(credential({ iss: 'attacker' }), clientId, mockFetch), /INVALID_GOOGLE_CREDENTIAL/);
  await assert.rejects(verifyGoogleCredential(credential({ exp: Math.floor(Date.now() / 1000) - 5 }), clientId, mockFetch), /INVALID_GOOGLE_CREDENTIAL/);
});

test('Google login rejects tampered signatures and unverified emails', async () => {
  const token = credential();
  const parts = token.split('.');
  parts[2] = parts[2][0] === 'A' ? 'B' + parts[2].slice(1) : 'A' + parts[2].slice(1);
  await assert.rejects(verifyGoogleCredential(parts.join('.'), clientId, mockFetch), /INVALID_GOOGLE_CREDENTIAL/);
  await assert.rejects(verifyGoogleCredential(credential({ email_verified: false }), clientId, mockFetch), /INVALID_GOOGLE_CREDENTIAL/);
});

test('Google login remains unavailable without configured web client ID', async () => {
  await assert.rejects(verifyGoogleCredential(credential(), '', mockFetch), /GOOGLE_LOGIN_NOT_CONFIGURED/);
});
