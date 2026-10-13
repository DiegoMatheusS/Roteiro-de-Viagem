import { VehicleType, FuelType } from '../types';

export interface VehicleCatalogItem {
  type: VehicleType;
  brand: string;
  model: string;
  versions: {
    name: string;
    years: number[];
    fuelType: FuelType;
    tankCapacityLiters: number;
    maxPassengers: number;
    consumption: {
      urbanKmL: number;
      highwayKmL: number;
      averageKmL: number;
      source: string;
      sourceDate: string;
    };
  }[];
}

export const KNOWN_VEHICLE_DATABASE: VehicleCatalogItem[] = [
  // MOTOCICLETAS
  {
    type: 'motorcycle',
    brand: 'Honda',
    model: 'CG 160 Titan / Fan',
    versions: [
      {
        name: '160cc FlexOne',
        years: [2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 16.1,
        maxPassengers: 2,
        consumption: {
          urbanKmL: 38.5,
          highwayKmL: 42.0,
          averageKmL: 40.2,
          source: 'Instituto Mauá / Teste Duas Rodas Brasil',
          sourceDate: 'Janeiro/2024'
        }
      }
    ]
  },
  {
    type: 'motorcycle',
    brand: 'Honda',
    model: 'CB 500X / NX 500',
    versions: [
      {
        name: '471cc Bicilíndrico DOHC',
        years: [2021, 2022, 2023, 2024],
        fuelType: 'gasolina',
        tankCapacityLiters: 17.7,
        maxPassengers: 2,
        consumption: {
          urbanKmL: 25.5,
          highwayKmL: 29.8,
          averageKmL: 27.6,
          source: 'Ficha Técnica Homologação Denatran / Duas Rodas',
          sourceDate: 'Março/2024'
        }
      }
    ]
  },
  {
    type: 'motorcycle',
    brand: 'BMW',
    model: 'R 1250 GS Adventure',
    versions: [
      {
        name: 'Boxer 1254cc ShiftCam',
        years: [2021, 2022, 2023, 2024],
        fuelType: 'gasolina',
        tankCapacityLiters: 30.0,
        maxPassengers: 2,
        consumption: {
          urbanKmL: 17.0,
          highwayKmL: 21.0,
          averageKmL: 19.0,
          source: 'BMW Motorrad Brasil Norma WMTC',
          sourceDate: 'Novembro/2023'
        }
      }
    ]
  },
  {
    type: 'motorcycle',
    brand: 'Yamaha',
    model: 'MT-07',
    versions: [
      {
        name: '689cc CP2 Crossplane',
        years: [2022, 2023, 2024],
        fuelType: 'gasolina',
        tankCapacityLiters: 14.0,
        maxPassengers: 2,
        consumption: {
          urbanKmL: 20.8,
          highwayKmL: 24.5,
          averageKmL: 22.6,
          source: 'Yamaha Motor do Brasil / Dados Aferidos Mauá',
          sourceDate: 'Fevereiro/2024'
        }
      }
    ]
  },
  {
    type: 'motorcycle',
    brand: 'Yamaha',
    model: 'Lander 250 ABS',
    versions: [
      {
        name: '249cc BlueFlex',
        years: [2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 13.6,
        maxPassengers: 2,
        consumption: {
          urbanKmL: 31.0,
          highwayKmL: 35.5,
          averageKmL: 33.2,
          source: 'Revista Motociclismo / Aferição Técnica',
          sourceDate: 'Abril/2024'
        }
      }
    ]
  },
  {
    type: 'motorcycle',
    brand: 'Triumph',
    model: 'Tiger 900 GT Pro',
    versions: [
      {
        name: '888cc T-Plane Triple',
        years: [2022, 2023, 2024],
        fuelType: 'gasolina',
        tankCapacityLiters: 20.0,
        maxPassengers: 2,
        consumption: {
          urbanKmL: 19.2,
          highwayKmL: 23.5,
          averageKmL: 21.3,
          source: 'Triumph Brasil / Ciclo WMTC Oficial',
          sourceDate: 'Janeiro/2024'
        }
      }
    ]
  },
  {
    type: 'motorcycle',
    brand: 'Royal Enfield',
    model: 'Meteor 350',
    versions: [
      {
        name: '349cc Série J',
        years: [2022, 2023, 2024],
        fuelType: 'gasolina',
        tankCapacityLiters: 15.0,
        maxPassengers: 2,
        consumption: {
          urbanKmL: 32.0,
          highwayKmL: 37.0,
          averageKmL: 34.5,
          source: 'Royal Enfield / Teste Aferido Quatro Rodas Moto',
          sourceDate: 'Maio/2024'
        }
      }
    ]
  },

  // CARROS
  {
    type: 'car',
    brand: 'Chevrolet',
    model: 'Onix',
    versions: [
      {
        name: '1.0 Aspirado Flex Manual',
        years: [2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 44.0,
        maxPassengers: 5,
        consumption: {
          urbanKmL: 13.3,
          highwayKmL: 16.6,
          averageKmL: 14.9,
          source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
          sourceDate: 'Tabela Oficial 2024'
        }
      },
      {
        name: '1.0 Turbo Flex Automático',
        years: [2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 44.0,
        maxPassengers: 5,
        consumption: {
          urbanKmL: 11.9,
          highwayKmL: 15.1,
          averageKmL: 13.5,
          source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
          sourceDate: 'Tabela Oficial 2024'
        }
      }
    ]
  },
  {
    type: 'car',
    brand: 'Fiat',
    model: 'Strada',
    versions: [
      {
        name: '1.3 Firefly Flex Manual',
        years: [2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 55.0,
        maxPassengers: 5,
        consumption: {
          urbanKmL: 12.1,
          highwayKmL: 13.3,
          averageKmL: 12.7,
          source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
          sourceDate: 'Tabela Oficial 2024'
        }
      }
    ]
  },
  {
    type: 'car',
    brand: 'Toyota',
    model: 'Corolla',
    versions: [
      {
        name: '2.0 Dynamic Force Flex CVT',
        years: [2021, 2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 50.0,
        maxPassengers: 5,
        consumption: {
          urbanKmL: 11.9,
          highwayKmL: 14.2,
          averageKmL: 13.0,
          source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
          sourceDate: 'Tabela Oficial 2024'
        }
      },
      {
        name: '1.8 Hybrid Flex',
        years: [2021, 2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 43.0,
        maxPassengers: 5,
        consumption: {
          urbanKmL: 17.9,
          highwayKmL: 15.4,
          averageKmL: 16.6,
          source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
          sourceDate: 'Tabela Oficial 2024'
        }
      }
    ]
  },
  {
    type: 'car',
    brand: 'Jeep',
    model: 'Compass',
    versions: [
      {
        name: '1.3 Turbo Flex Automático',
        years: [2022, 2023, 2024],
        fuelType: 'flex',
        tankCapacityLiters: 60.0,
        maxPassengers: 5,
        consumption: {
          urbanKmL: 10.4,
          highwayKmL: 12.1,
          averageKmL: 11.2,
          source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
          sourceDate: 'Tabela Oficial 2024'
        }
      }
    ]
  },
  {
    type: 'car',
    brand: 'Hyundai',
    model: 'HB20',
    versions: [
      {
        name: '1.0 Aspirado Flex Manual',
        years: [2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 50.0,
        maxPassengers: 5,
        consumption: {
          urbanKmL: 13.1,
          highwayKmL: 14.6,
          averageKmL: 13.8,
          source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
          sourceDate: 'Tabela Oficial 2024'
        }
      }
    ]
  },
  {
    type: 'car',
    brand: 'Volkswagen',
    model: 'Polo',
    versions: [
      {
        name: '1.0 TSI Turbo Flex',
        years: [2022, 2023, 2024, 2025],
        fuelType: 'flex',
        tankCapacityLiters: 52.0,
        maxPassengers: 5,
        consumption: {
          urbanKmL: 13.5,
          highwayKmL: 15.0,
          averageKmL: 14.2,
          source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
          sourceDate: 'Tabela Oficial 2024'
        }
      }
    ]
  }
];

export function lookupVehicleBenchmark(type: VehicleType, brand: string, model: string, year?: number) {
  const match = KNOWN_VEHICLE_DATABASE.find(
    v => v.type === type && 
         v.brand.toLowerCase() === brand.trim().toLowerCase() && 
         v.model.toLowerCase().includes(model.trim().toLowerCase())
  );
  if (!match) return null;

  if (year) {
    const versionMatch = match.versions.find(ver => ver.years.includes(year));
    if (versionMatch) return { item: match, version: versionMatch };
  }
  return { item: match, version: match.versions[0] };
}
