import React from 'react';

/** Account/session hydration must finish before mounting the interactive map.
 * Otherwise a temporary, unstyled map flashes its traffic control, logo and
 * attribution before the actual home screen takes over. The real map retains
 * its required provider credits once it is visible to the user. */
export function StartupMap({notice}:{notice?:React.ReactNode}){
  return <main className="rdv-startup"
    aria-label="Preparando o RUAVO">
    <span role="status" aria-label="Abrindo o RUAVO">
      <img src="/ruavo-logo.png" alt="RUAVO" width={112} height={112} className="rdv-startup-logo"/>
      <span className="rdv-startup-message">Preparando o aplicativo…</span>
    </span>
    {notice&&<div className="absolute z-50 bottom-6 left-3 right-3 mx-auto max-w-md
      rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-md text-sm text-slate-800"
      role="status">{notice}</div>}
  </main>;
}
