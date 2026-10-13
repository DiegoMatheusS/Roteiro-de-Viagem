import { useEffect } from 'react';

let locks = 0;
let previousOverflow = '';
export function useModalScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (locks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    return () => { if (--locks === 0) document.body.style.overflow = previousOverflow; };
  }, [enabled]);
}
