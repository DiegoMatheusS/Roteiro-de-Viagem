import React from 'react';

/** Account/session hydration must finish before mounting the interactive map.
 * Otherwise a temporary, unstyled map flashes its traffic control, logo and
 * attribution before the actual home screen takes over. The real map retains
 * its required provider credits once it is visible to the user. */
export function StartupMap({notice}:{notice?:React.ReactNode}){
  return <main className="relative grid h-[100dvh] w-full place-items-center overflow-hidden bg-[#1d2e48]"
    aria-label="Preparando o Rolê">
    {!notice&&<span role="status" aria-label="Abrindo o Rolê"
      className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/25 border-t-white/80"/>}
    {notice&&<div className="absolute z-50 bottom-6 left-3 right-3 mx-auto max-w-md
      rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-md text-sm text-slate-800"
      role="status">{notice}</div>}
  </main>;
}
