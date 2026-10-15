import React, { useState } from 'react';
import { fuelApi } from '../../services/fuelApi';
import { buttonClass, inputClass } from './shared';

export function PasswordSettings({ onPasswordChanged }: { onPasswordChanged: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword') || '');
    const newPassword = String(data.get('newPassword') || '');
    const confirmPassword = String(data.get('confirmPassword') || '');
    setError('');
    if (newPassword.length < 10 || newPassword.length > 128) {
      setError('A nova senha deve ter de 10 a 128 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Escolha uma senha diferente da atual.');
      return;
    }
    setBusy(true);
    try {
      const response = await fuelApi<{ ok: boolean; message: string }>('/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      form.reset();
      onPasswordChanged(response.message || 'Senha alterada. Entre novamente.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="max-w-2xl space-y-5" aria-labelledby="password-settings-title">
    <div>
      <h2 id="password-settings-title" className="text-xl font-bold">Configurações da conta</h2>
      <p className="text-sm text-slate-600 mt-2">Altere a senha de acesso ao painel administrativo.</p>
    </div>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-5 md:p-7" autoComplete="on">
      <h3 className="font-bold text-base">Alterar senha</h3>
      <p className="text-sm text-slate-600">Por segurança, confirme sua senha atual. Depois da alteração, todas as sessões desta conta serão encerradas.</p>
      <label className="block text-sm font-semibold">Senha atual
        <input name="currentPassword" type="password" required autoComplete="current-password" maxLength={128} className={`${inputClass} mt-1`} />
      </label>
      <label className="block text-sm font-semibold">Nova senha
        <input name="newPassword" type="password" required autoComplete="new-password" minLength={10} maxLength={128} aria-describedby="new-password-hint" className={`${inputClass} mt-1`} />
      </label>
      <p id="new-password-hint" className="text-xs text-slate-500">De 10 a 128 caracteres. Prefira uma senha longa e exclusiva, não utilizada em outros serviços.</p>
      <label className="block text-sm font-semibold">Confirmar nova senha
        <input name="confirmPassword" type="password" required autoComplete="new-password" minLength={10} maxLength={128} className={`${inputClass} mt-1`} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className={`${buttonClass} bg-emerald-700 text-white border-emerald-700`}>
        {busy ? 'Alterando senha...' : 'Salvar nova senha'}
      </button>
    </form>
  </section>;
}
