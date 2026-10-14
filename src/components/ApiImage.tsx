import React, { useEffect, useState } from 'react';
import { isNativeApp, TravelNative } from '../services/nativeApp';
export function ApiImage({ path, ...props }: { path: string } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const [src, setSrc] = useState(isNativeApp() ? '' : '/api' + path);
  useEffect(() => { let disposed = false; if (isNativeApp()) void TravelNative.request({ path, method: 'GET', binary: true }).then(r => { if (!disposed && r.status === 200) setSrc('data:image/jpeg;base64,' + r.body); }).catch(() => {}); return () => { disposed = true; }; }, [path]);
  return src ? <img {...props} src={src} /> : <span className="text-xs text-slate-500">Carregando foto...</span>;
}
