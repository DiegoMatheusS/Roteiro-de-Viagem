import React, { useState } from 'react';
import { buttonClass, inputClass } from './shared';
import { fuelApi } from '../../services/fuelApi';

const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function TollTariffEditor({ placeId, onChange }: { placeId: string; onChange: () => void }) {
  const [vehicleType, setVehicleType] = useState('car'), [price, setPrice] = useState(''), [heading, setHeading] = useState('');
  const [observedAt, setObservedAt] = useState(localNow), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  return <form className="border-t pt-4 space-y-3" onSubmit={async event => {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (!price.trim()) throw new Error('Informe a tarifa, inclusive zero se a categoria for isenta.');
      await fuelApi(`/admin/places/${encodeURIComponent(placeId)}/tariffs`, { method: 'POST', body: JSON.stringify({ vehicleType, price: Number(price.replace(',', '.')), headingDegrees: heading === '' ? null : Number(heading), observedAt: new Date(observedAt).toISOString(), confirmed: true }) });
      setMessage('Tarifa publicada. O cálculo da rota usará o valor para esta categoria.'); onChange();
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }}><h4 className="font-bold">Cadastrar tarifa de pedágio</h4><div className="grid md:grid-cols-2 gap-3">
    <label className="text-xs font-semibold">Categoria do veículo<select aria-label="Categoria do veículo" value={vehicleType} onChange={event => setVehicleType(event.target.value)} className={`${inputClass} mt-1`}><option value="car">Carro</option><option value="motorcycle">Moto</option></select></label>
    <label className="text-xs font-semibold">Tarifa por passagem (R$)<input required inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="Ex.: 12,50" className={`${inputClass} mt-1`} /></label>
    <label className="text-xs font-semibold">Sentido em graus (opcional)<input type="number" min="0" max="359" step="any" value={heading} onChange={event => setHeading(event.target.value)} placeholder="Vazio: ambos os sentidos" className={`${inputClass} mt-1`} /></label>
    <label className="text-xs font-semibold">Data da conferência<input required type="datetime-local" max={localNow()} value={observedAt} onChange={event => setObservedAt(event.target.value)} className={`${inputClass} mt-1`} /></label>
  </div><p className="text-xs text-slate-500">Validade de 90 dias a partir da conferência. Cadastre carro e moto separadamente; use zero para uma categoria isenta.</p>
    <label className="flex gap-2 text-xs"><input required type="checkbox" />Conferi esta tarifa para a categoria e o sentido selecionados.</label>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    <button disabled={busy} className={`${buttonClass} bg-emerald-600 text-white border-emerald-600`}>{busy ? 'Publicando...' : 'Publicar tarifa'}</button>
  </form>;
}
