import React, { useEffect, useState } from 'react';
import { fuelApi } from '../../services/fuelApi';
import { buttonClass, inputClass } from './shared';

export function EmailSettings({ onEmailChanged }: { onEmailChanged: (message: string) => void }) {
  const [currentEmail, setCurrentEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fuelApi<{ email: string }>('/admin/account')
      .then(result => { if (active) setCurrentEmail(result.email); })
      .catch(failure => { if (active) setError((failure as Error).message); });
    return () => { active = false; };
  }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const newEmail = String(data.get('newEmail') || '').trim().toLowerCase();
    const confirmEmail = String(data.get('confirmEmail') || '').trim().toLowerCase();
    const currentPassword = String(data.get('currentPassword') || '');
    setError('');
    if (!newEmail || newEmail !== confirmEmail) {
      setError('Confirme o novo e-mail exatamente como foi informado.');
      return;
    }
    if (newEmail === currentEmail) {
      setError('Escolha um e-mail diferente do atual.');
      return;
    }
    setBusy(true);
    try {
      const response = await fuelApi<{ ok: boolean; message: string }>('/admin/change-email', {
        method: 'POST',
        body: JSON.stringify({ newEmail, confirmEmail, currentPassword }),
      });
      form.reset();
      onEmailChanged(response.message || 'E-mail atualizado. Entre novamente.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="max-w-2xl space-y-4" aria-labelledby="email-settings-title">
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-5 md:p-7">
      <h3 id="email-settings-title" className="font-bold text-base">Alterar e-mail</h3>
      <p className="text-sm text-slate-600">O novo endereço será usado no próximo login. Confirme a senha atual para autorizar a alteração; todas as sessões serão encerradas.</p>
      <p className="text-sm text-slate-600">E-mail atual: <strong>{currentEmail || 'Consultando...'}</strong></p>
      <label className="block text-sm font-semibold">Novo e-mail
        <input name="newEmail" type="email" required autoComplete="email" maxLength={180} className={`${inputClass} mt-1`} />
      </label>
      <label className="block text-sm font-semibold">Confirmar novo e-mail
        <input name="confirmEmail" type="email" required maxLength={180} className={`${inputClass} mt-1`} />
      </label>
      <label className="block text-sm font-semibold">Senha atual
        <input name="currentPassword" type="password" required autoComplete="current-password" maxLength={128} className={`${inputClass} mt-1`} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className={`${buttonClass} bg-emerald-700 text-white border-emerald-700`}>
        {busy ? 'Alterando e-mail...' : 'Salvar novo e-mail'}
      </button>
    </form>
  </section>;
}
