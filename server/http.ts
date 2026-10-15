import type { Request, Response, NextFunction } from 'express';
import type { FuelUser } from '../src/types/fuel';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

// Trust a forwarded client address only when our Pages Worker authenticates it.
// Direct/native requests continue to use Express's Railway proxy configuration.
export function clientIp(req: Request): string {
  const secret = process.env.WEB_PROXY_SECRET || '';
  const supplied = req.get('X-Rdv-Proxy-Key') || '';
  const address = req.get('X-Rdv-Client-Ip') || '';
  const expectedBytes = Buffer.from(secret), suppliedBytes = Buffer.from(supplied);
  if (secret.length >= 32 && isIP(address) && expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)) return address;
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
export const user = (res: Response): FuelUser => res.locals.user;
export const auth = (_req: Request, res: Response, next: NextFunction) =>
  user(res) ? next() : next(new ApiError('Entre na sua conta para contribuir.', 401));
export const administrator = (_req: Request, res: Response, next: NextFunction) =>
  user(res)?.role === 'admin' ? next() : next(new ApiError('Acesso exclusivo do administrador.', 403));
export const now = () => new Date().toISOString();
export const validate = <T,>(callback: () => T): T => {
  try { return callback(); } catch (error) { throw new ApiError((error as Error).message); }
};
export function observationDate(value: unknown) {
  const date = new Date(typeof value === 'string' ? value : '');
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000 || date.getTime() < Date.now() - 90 * 86400000)
    throw new ApiError('Informe a data da informação: até 90 dias atrás, sem data futura.');
  return date.toISOString();
}
