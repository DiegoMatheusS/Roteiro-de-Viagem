import React from 'react';

/** Account/session hydration must finish before mounting the interactive map.
 * Otherwise a temporary, unstyled map flashes its traffic control, logo and
 * attribution before the actual home screen takes over. The real map retains
 * its required provider credits once it is visible to the user. */
export function StartupMap({notice}:{notice?:React.ReactNode}){
  return <main className="rdv-startup"
    aria-label="Preparando o Rolê">
    <span role="status" aria-label="Abrindo o Rolê">
      <img src="/roteiro-logo.png" alt="Rolê" width={112} height={112} className="rdv-startup-logo"/>
    </span>
    {notice&&<div className="absolute z-50 bottom-6 left-3 right-3 mx-auto max-w-md
      rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-md text-sm text-slate-800"
      role="status">{notice}</div>}
  </main>;
}
