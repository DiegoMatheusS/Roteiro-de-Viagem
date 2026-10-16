import test from 'node:test';
import assert from 'node:assert/strict';
import adminWorker from '../admin-worker.js';
import publicWorker from '../public/_worker.js';

const adminOrigin = 'https://admin-roteiro-test.pages.dev';
const travelerOrigin = 'https://roteiro-test.pages.dev';
const backendOrigin = 'https://roteiro-api-production.up.railway.app';
const proxySecret = 'admin-worker-test-secret-123456789012345';

test('separate admin Worker forwards admin API calls; the public site blocks them', async () => {
  const env = {
    RDV_BACKEND_ORIGIN: backendOrigin,
    WEB_PROXY_SECRET: proxySecret,
    ASSETS: { fetch: async () => new Response('<h1>Admin</h1>', { status: 200 }) },
  };
  const originalFetch = globalThis.fetch;
  let forwarded: Request | undefined;
  globalThis.fetch = async (input: any, init?: any) => {
    forwarded = new Request(input, init);
    return Response.json({ tolls: 1, photos: 0, prices: 0, comments: 0, reports: 0 });
  };
  try {
    const response = await adminWorker.fetch(new Request(adminOrigin + '/api/admin/summary', {
      headers: {
        Cookie: 'rdv_session=example-session',
        'CF-Connecting-IP': '2001:db8::5',
        'X-Rdv-Proxy-Key': 'spoofed',
      },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).tolls, 1);
    assert.equal(forwarded?.url, backendOrigin + '/api/admin/summary');
    assert.equal(forwarded?.headers.get('cookie'), 'rdv_session=example-session');
    assert.equal(forwarded?.headers.get('x-rdv-proxy-key'), proxySecret);
    assert.equal(forwarded?.headers.get('x-rdv-client-ip'), '2001:db8::5');

    const publicResponse = await publicWorker.fetch(
      new Request(travelerOrigin + '/api/admin/summary'), env);
    assert.equal(publicResponse.status, 404);

    const rejectedWrite = await adminWorker.fetch(new Request(adminOrigin + '/api/admin/places', {
      method: 'POST',
      headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' },
      body: '{}',
    }), env);
    assert.equal(rejectedWrite.status, 403);

    const asset = await adminWorker.fetch(new Request(adminOrigin + '/'), env);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /Admin/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin Worker refuses to proxy without the server-side secret', async () => {
  const response = await adminWorker.fetch(new Request(adminOrigin + '/api/admin/summary'), {
    RDV_BACKEND_ORIGIN: backendOrigin,
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
