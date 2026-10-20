import {Award,CarFront,ChevronRight,Plus,Settings2,ShieldCheck,X} from 'lucide-react';
import type {TravelerProfile,TripPlan,Vehicle} from '../types';
import {storageService} from '../services/storageService';
import '../role-profile-figma.css';

interface Props {
  profile:TravelerProfile;
  vehicles:Vehicle[];
  trips:TripPlan[];
  selectedVehicleId:string;
  accountLabel?:string;
  onLogin:()=>void;
  onEdit:()=>void;
  onAddVehicle:()=>void;
  onOpenGarage:()=>void;
  onSelectVehicle:(id:string)=>void;
  onOpenSafety:()=>void;
  onOpenSettings:()=>void;
}
const km=(value:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value);

/** Tela 7/7: visão principal fiel ao PNG, sem substituir a lógica de garagem, SOS ou conta. */
export function ProfileFigmaHome({
  profile,vehicles,trips,selectedVehicleId,accountLabel,
  onLogin,onEdit,onAddVehicle,onOpenGarage,onSelectVehicle,onOpenSafety,onOpenSettings
}:Props){
  const totalKm=Math.max(0,profile.verifiedGpsKm+profile.manualKm);
  const tier=storageService.calculateTier(totalKm);
  const completedTrips=trips.filter(t=>t.status==='completed').length;
  const savedRoutes=trips.filter(t=>t.status==='planned'&&!t.departureAt).length;
  const progressKm=Math.max(0,totalKm-tier.thresholdMin);
  const tierLength=Math.max(1,tier.thresholdMax-tier.thresholdMin);
  const progressDisplay=`${km(progressKm)} / ${km(tierLength)} km`;

  return <section className="rdv-profile-figma" aria-label="Perfil e garagem">
    <div className="rdv-profile-scroll">
      <header className="rdv-profile-header"><h1>Perfil e garagem</h1></header>
      <div className="rdv-profile-user">
        <div className="rdv-profile-avatar" aria-hidden="true">
          {profile.photoUrl?<img src={profile.photoUrl} alt="" />:profile.name.trim().charAt(0).toLocaleUpperCase('pt-BR')||'V'}
        </div>
        <div className="rdv-profile-identity">
          <h2>{profile.name}</h2>
          <p><Award size={14} strokeWidth={1.5}/> Nível {tier.tier}</p>
        </div>
        <button type="button" onClick={onEdit} className="rdv-profile-edit">Editar</button>
      </div>
      {!accountLabel&&<button type="button" onClick={onLogin}
        className="rdv-profile-login">Entrar / Criar conta</button>}

      <div className="rdv-profile-progress" role="region" aria-label="Progresso do nível">
        <div className="rdv-profile-progress-titles">
          <strong>{tier.nextTier?`Seu caminho até ${tier.nextTier}`:'Nível máximo alcançado'}</strong>
          <span>{progressDisplay}</span>
        </div>
        <div className="rdv-profile-progress-bar" role="progressbar"
          aria-valuemin={0} aria-valuemax={tierLength}
          aria-valuenow={Math.min(tierLength,progressKm)} aria-label="Quilometragem para o próximo nível">
          <span style={{width:`${tier.progressPercent}%`}}/>
        </div>
        <p>{tier.nextTier?`Faltam ${km(tier.neededKmForNextTier)} km para o nível ${tier.nextTier}.`:
          'Você chegou ao nível mais alto.'}</p>
      </div>

      <div className="rdv-profile-stats" role="group" aria-label="Estatísticas do viajante">
        <div><strong>{km(totalKm)} km</strong><span>percorridos</span></div>
        <div><strong>{completedTrips}</strong><span>viagens</span></div>
        <div><strong>{savedRoutes}</strong><span>rotas salvas</span></div>
      </div>

      <div className="rdv-profile-garage-heading">
        <button type="button" onClick={onOpenGarage} aria-label="Minha Garagem">Minha garagem</button>
        <button type="button" onClick={onAddVehicle} className="rdv-profile-garage-add">
          <Plus size={17} strokeWidth={1.6}/> Adicionar
        </button>
      </div>
      {vehicles.length===0?
        <button type="button" className="rdv-profile-empty-vehicle"
          onClick={onAddVehicle} aria-label="Cadastrar meu veículo">
          <span className="rdv-profile-car-icon"><span><X size={15} strokeWidth={1.25}/></span></span>
          <span className="rdv-profile-car-copy">
            <strong>Cadastre seu veículo</strong>
            <small>Deixe tudo pronto para o próximo rolê.</small>
          </span>
        </button>
        <div className="rdv-profile-vehicles" aria-label="Veículos da garagem">
          {vehicles.slice(0,3).map(v=><button type="button" key={v.id}
            className="rdv-profile-vehicle" aria-label={`Selecionar veículo ${v.nickname||v.model}`}
            aria-pressed={v.id===selectedVehicleId}
            onClick={()=>{onSelectVehicle(v.id);onOpenGarage();}}>
            <span className="rdv-profile-car-icon"><CarFront size={22}/></span>
            <span className="rdv-profile-car-copy">
              <strong>{v.nickname||`${v.brand} ${v.model}`}</strong>
              <small>{v.brand} {v.model} · {v.year}{v.id===selectedVehicleId?' · em uso':''}</small>
            </span>
            <ChevronRight size={17}/>
          </button>)}
          {vehicles.length>3&&<button type="button" onClick={onOpenGarage}
            className="rdv-profile-garage-more">Ver todos os {vehicles.length} veículos</button>}
        </div>}

      <div className="rdv-profile-settings-group">
        <button type="button" onClick={onOpenSafety} className="rdv-profile-settings-link">
          <ShieldCheck size={21} strokeWidth={1.55}/>
          <span><strong>Segurança e SOS</strong><small>Contatos e ajuda em emergência</small></span>
          <ChevronRight size={18}/>
        </button>
        <button type="button" onClick={onOpenSettings} className="rdv-profile-settings-link">
          <Settings2 size={21} strokeWidth={1.55}/>
          <span><strong>Configurações</strong><small>Navegação, voz e privacidade</small></span>
          <ChevronRight size={18}/>
        </button>
      </div>
    </div>
  </section>;
}
