// Cloudflare Pages advanced mode. Secrets are runtime bindings, never browser code.
const DEFAULT_BACKEND = 'https://roteiro-api-production.up.railway.app';
const error = (message, status) => protect(Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } }));
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Safe baseline for the HTML, maps and Google sign-in (no script-src restriction yet).
  'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
};
const protect = response => {
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) result.headers.set(name, value);
  return result;
};


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase();
    // The public travel website must never serve the admin interface or proxy admin APIs.
    // A separate administration site connects to the same backend with its own access controls.
    if (pathname === '/admin' || pathname.startsWith('/admin/') ||
        pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
      return protect(new Response('Página não encontrada.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      }));
    }
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return protect(await env.ASSETS.fetch(request));
    if (!['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return error('Método não permitido.', 405);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('Origin') !== url.origin) return error('Origem da solicitação não permitida.', 403);
    if (typeof env.WEB_PROXY_SECRET !== 'string' || env.WEB_PROXY_SECRET.length < 32) return error('O serviço ainda não está configurado.', 503);
    let backend;
    try {
      backend = new URL(env.RDV_BACKEND_ORIGIN || DEFAULT_BACKEND);
      if (backend.protocol !== 'https:' || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash || backend.origin === url.origin) throw new Error();
    } catch { return error('O serviço ainda não está configurado.', 503); }
    backend.pathname = url.pathname;
    backend.search = url.search;
    const forwarded = new Request(backend, request);
    const clientIp = request.headers.get('CF-Connecting-IP');
    for (const name of ['Host', 'Forwarded', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Real-IP', 'CF-Connecting-IP', 'X-Rdv-Proxy-Key', 'X-Rdv-Client-Ip']) forwarded.headers.delete(name);
    forwarded.headers.set('X-Rdv-Proxy-Key', env.WEB_PROXY_SECRET);
    if (clientIp) forwarded.headers.set('X-Rdv-Client-Ip', clientIp);
    try {
      // Keep cookies, JSON, uploads and binary photos; never forward credentials through redirects.
      const response = await fetch(new Request(forwarded, { redirect: 'manual', cache: 'no-store' }));
      const result = new Response(response.body, response);
      result.headers.set('Cache-Control', 'no-store');
      return protect(result);
    } catch { return error('Não foi possível acessar o servidor. Tente novamente.', 503); }
  }
};
