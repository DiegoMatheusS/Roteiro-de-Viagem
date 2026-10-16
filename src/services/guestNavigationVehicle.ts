import type {Vehicle} from '../types';

/** Usado somente para iniciar navegação sem cadastro ou conta.
 * A estimativa de combustível permanece indisponível até haver veículo configurado.
 */
export const GUEST_NAVIGATION_VEHICLE:Vehicle = {
  id:'role-guest-navigation',
  type:'car',
  brand:'',
  model:'Veículo não cadastrado',
  year:2026,
  nickname:'Navegação sem cadastro',
  fuelType:'gasolina',
  tankCapacityLiters:0,
  consumption:{
    referenceUrban:0,referenceHighway:0,referenceAverage:0,
    source:'Não informado',sourceDate:'',userConfigured:0
  },
  maxPassengers:1,
  odometerKm:0
};
