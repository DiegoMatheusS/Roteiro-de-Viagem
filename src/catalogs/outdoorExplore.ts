import type {ExplorePlace} from '../types/explore';

// Verified photo credits and location sources are retained per destination.
// Volatile opening hours, ticket prices and reviews are not cached.
export const OUTDOOR_EXPLORE_CATALOG: readonly ExplorePlace[] = [
  {
    "id": "sp-estrada-cunhaparaty",
    "name": "Estrada Cunha–Paraty",
    "aliases": [
      "SP-171",
      "Cunha Paraty",
      "Serra da Bocaina"
    ],
    "coords": [
      -23.0841588,
      -44.960814
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Cunha",
    "address": "SP-171, trecho paulista entre Cunha e a Serra da Bocaina, Cunha, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Road_from_Cunha_to_Paraty_2018_01.jpg/330px-Road_from_Cunha_to_Paraty_2018_01.jpg",
    "photoCredit": "Photograph by Mike Peel (www.mikepeel.net). · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Road_from_Cunha_to_Paraty_2018_01.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Rodovia_Paulo_Virg%C3%ADnio_e_Salvador_Pacetti",
    "coordinateSource": "https://www.openstreetmap.org/way/863694475",
    "curated": true
  },
  {
    "id": "sp-rodovia-oswaldo-cruz",
    "name": "Rodovia Oswaldo Cruz",
    "aliases": [
      "SP-125",
      "São Luiz do Paraitinga",
      "Taubaté"
    ],
    "coords": [
      -23.364515,
      -45.124071
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Ubatuba",
    "address": "SP-125, trecho da Serra do Mar, Ubatuba, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Rodovia_Oswaldo_Cruz%2C_Trecho_de_Serra_1.jpg/330px-Rodovia_Oswaldo_Cruz%2C_Trecho_de_Serra_1.jpg",
    "photoCredit": "Themium · CC0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Rodovia_Oswaldo_Cruz,_Trecho_de_Serra_1.jpg",
    "photoLicense": "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Rodovia_Oswaldo_Cruz",
    "coordinateSource": "https://commons.wikimedia.org/wiki/File:Rodovia_Oswaldo_Cruz,_Trecho_de_Serra_1.jpg",
    "curated": true
  },
  {
    "id": "sp-rodovia-monteiro-lobato",
    "name": "Rodovia Monteiro Lobato",
    "aliases": [
      "SP-050",
      "Monteiro Lobato",
      "São Francisco Xavier",
      "Mantiqueira"
    ],
    "coords": [
      -22.859251,
      -45.778248
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Santo Antônio do Pinhal",
    "address": "Rodovia Monteiro Lobato, Santo Antônio do Pinhal, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6f/Serras_da_Mantiqueira_-_panoramio.jpg/330px-Serras_da_Mantiqueira_-_panoramio.jpg",
    "photoCredit": "IsmaelSilva · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Serras_da_Mantiqueira_-_panoramio.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/SP-50",
    "coordinateSource": "https://commons.wikimedia.org/wiki/File:Serras_da_Mantiqueira_-_panoramio.jpg",
    "curated": true
  },
  {
    "id": "sp-rodovia-riosantos",
    "name": "Rodovia Rio–Santos",
    "aliases": [
      "Rio Santos",
      "SP-055",
      "SP-55",
      "BR-101",
      "Juqueí"
    ],
    "coords": [
      -23.770368,
      -45.7080852
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "São Sebastião",
    "address": "SP-055, trecho próximo a Juqueí e Barra do Sahy, São Sebastião, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/Rodovia_Rio_Santos.JPG/330px-Rodovia_Rio_Santos.JPG",
    "photoCredit": "Cacobianchi · Public domain",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Rodovia_Rio_Santos.JPG",
    "sourceUrl": "https://pt.wikipedia.org/wiki/BR-101",
    "coordinateSource": "https://www.openstreetmap.org/way/169386981",
    "curated": true
  },
  {
    "id": "sp-cachoeira-dos-pretos",
    "name": "Cachoeira dos Pretos",
    "coords": [
      -22.964217,
      -46.172492
    ],
    "kind": "waterfall",
    "category": "Cachoeiras",
    "city": "Joanópolis",
    "address": "Cachoeira dos Pretos, Joanópolis, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/61/Cachoeira_dos_Pretos.jpg/330px-Cachoeira_dos_Pretos.jpg",
    "photoCredit": "User:OS2Warp · Public domain",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Cachoeira_dos_Pretos.jpg",
    "sourceUrl": "https://www.joanopolis.sp.gov.br/portal/turismo/0/9/24468/cachoeira-dos-pretos/",
    "coordinateSource": "https://www.waze.com/live-map/directions/cachoeira-dos-pretos-est.-para-a-cachoeira-joanopolis?to=place.w.205653538.2056731992.7001416",
    "curated": true
  },
  {
    "id": "sp-cachoeira-saltao",
    "name": "Cachoeira Saltão",
    "aliases": [
      "Cachoeira do Saltão"
    ],
    "coords": [
      -22.3907229,
      -47.8897529
    ],
    "kind": "waterfall",
    "category": "Cachoeiras",
    "city": "Itirapina",
    "address": "Cachoeira Saltão, Itirapina, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/90/Cachoeira_do_Salt%C3%A3o%2C_Itirapina_-_SP_por_Tatiane_Domingues.jpg/330px-Cachoeira_do_Salt%C3%A3o%2C_Itirapina_-_SP_por_Tatiane_Domingues.jpg",
    "photoCredit": "Tatiane Aparecida Domingues da Silva · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Cachoeira_do_Salt%C3%A3o,_Itirapina_-_SP_por_Tatiane_Domingues.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://www.saltao.com.br/",
    "coordinateSource": "https://www.waze.com/live-map/directions/br/sp/cachoeira-do-saltao?to=place.ChIJSR22eWWNx5QRy35pVG7zx9c",
    "curated": true
  },
  {
    "id": "sp-cachoeira-grande-de-lagoinha",
    "name": "Cachoeira Grande de Lagoinha",
    "coords": [
      -23.122228,
      -45.2101674
    ],
    "kind": "waterfall",
    "category": "Cachoeiras",
    "city": "Lagoinha",
    "address": "Cachoeira Grande de Lagoinha, Lagoinha, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Cachoeira_Grande_-_Lagoinha_-_SP_-_Brasil_%2817841127541%29.jpg/330px-Cachoeira_Grande_-_Lagoinha_-_SP_-_Brasil_%2817841127541%29.jpg",
    "photoCredit": "Marinelson Almeida - Traveling through Brazil from Niteroi, Brasil · CC BY 2.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Cachoeira_Grande_-_Lagoinha_-_SP_-_Brasil_(17841127541).jpg",
    "photoLicense": "https://creativecommons.org/licenses/by/2.0",
    "sourceUrl": "https://www.cachoeiragrandelagoinha.com/",
    "coordinateSource": "https://www.openstreetmap.org/node/4617051266",
    "curated": true
  },
  {
    "id": "sp-cachoeira-do-itambe",
    "name": "Cachoeira do Itambé",
    "coords": [
      -21.2950327,
      -47.1479709
    ],
    "kind": "waterfall",
    "category": "Cachoeiras",
    "city": "Cássia dos Coqueiros",
    "address": "Cachoeira do Itambé, Cássia dos Coqueiros, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/Cachoeira_do_Itamb%C3%A9-_C%C3%A1ssia_dos_Coqueiros.JPG/330px-Cachoeira_do_Itamb%C3%A9-_C%C3%A1ssia_dos_Coqueiros.JPG",
    "photoCredit": "Kelvin Igneus · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Cachoeira_do_Itamb%C3%A9-_C%C3%A1ssia_dos_Coqueiros.JPG",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://turismo.mococa.sp.gov.br/atracao/detalhe/15/cachoeira-de-itambe/",
    "coordinateSource": "https://www.openstreetmap.org/node/4019641600",
    "curated": true
  },
  {
    "id": "sp-lago-do-taboao",
    "name": "Lago do Taboão",
    "coords": [
      -22.9770815,
      -46.5318991
    ],
    "kind": "lake",
    "category": "Lagos",
    "city": "Bragança Paulista",
    "address": "Lago do Taboão, Bragança Paulista, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7f/Lago_do_Tabo%C3%A3o_-_Bragan%C3%A7a_Paulista_-_panoramio.jpg/330px-Lago_do_Tabo%C3%A3o_-_Bragan%C3%A7a_Paulista_-_panoramio.jpg",
    "photoCredit": "MARCO AURÉLIO ESPARZ… · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Lago_do_Tabo%C3%A3o_-_Bragan%C3%A7a_Paulista_-_panoramio.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://turismopaulista.tur.br/bragancapaulista",
    "coordinateSource": "https://www.waze.com/live-map/directions/br/sp/playground-lago-do-taboao?to=place.ChIJs6lkCsvJzpQRwZOG1_Tl7Pg",
    "curated": true
  },
  {
    "id": "sp-lagoa-do-taquaral",
    "name": "Lagoa do Taquaral",
    "coords": [
      -22.87528,
      -47.05333
    ],
    "kind": "lake",
    "category": "Lagos",
    "city": "Campinas",
    "address": "Lagoa do Taquaral, Campinas, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/37/Parque_Portugal_%2813%29.jpg/330px-Parque_Portugal_%2813%29.jpg",
    "photoCredit": "Raphael Henrique Figueira · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Parque_Portugal_(13).jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_Portugal",
    "coordinateSource": "https://pt.wikipedia.org/wiki/Parque_Portugal",
    "curated": true
  },
  {
    "id": "sp-lago-azul-de-rio-claro",
    "name": "Lago Azul de Rio Claro",
    "aliases": [
      "Parque Lago Azul"
    ],
    "coords": [
      -22.392668089528943,
      -47.56368507022497
    ],
    "kind": "lake",
    "category": "Lagos",
    "city": "Rio Claro",
    "address": "Lago Azul de Rio Claro, Rio Claro, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/46/Lago_Azul_de_Rio_Claro%2C_S%C3%A3o_Paulo.jpg/330px-Lago_Azul_de_Rio_Claro%2C_S%C3%A3o_Paulo.jpg",
    "photoCredit": "Raphael Cherfem · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Lago_Azul_de_Rio_Claro,_S%C3%A3o_Paulo.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_Lago_Azul",
    "coordinateSource": "https://www.waze.com/es/live-map/directions/lago-azul-r.-2-a-rio-claro?to=place.w.204736040.2047622545.590804",
    "curated": true
  },
  {
    "id": "sp-horto-florestal-parque-estadual-alberto-lofgren",
    "name": "Horto Florestal - Parque Estadual Alberto Löfgren",
    "coords": [
      -23.45917,
      -46.63389
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "São Paulo",
    "address": "Horto Florestal - Parque Estadual Alberto Löfgren, São Paulo, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/Parque_Alberto_L%C3%B6fgren_%28Horto_Florestal%29_-_panoramio_%286%29.jpg/330px-Parque_Alberto_L%C3%B6fgren_%28Horto_Florestal%29_-_panoramio_%286%29.jpg",
    "photoCredit": "CORRETOR-CARVALHO · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Parque_Alberto_L%C3%B6fgren_(Horto_Florestal)_-_panoramio_(6).jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Horto_Florestal_de_S%C3%A3o_Paulo",
    "coordinateSource": "https://pt.wikipedia.org/wiki/Horto_Florestal_de_S%C3%A3o_Paulo",
    "curated": true
  },
  {
    "id": "sp-parque-estadual-do-juquery",
    "name": "Parque Estadual do Juquery",
    "coords": [
      -23.344919184790843,
      -46.69249088502624
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "Franco da Rocha",
    "address": "Parque Estadual do Juquery, Franco da Rocha, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Ovo_da_Pata.JPG/330px-Ovo_da_Pata.JPG",
    "photoCredit": "Ricksocieties · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Ovo_da_Pata.JPG",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://guiadeareasprotegidas.sp.gov.br/ap/parque-estadual-juquery/",
    "coordinateSource": "https://guiadeareasprotegidas.sp.gov.br/ap/parque-estadual-juquery/",
    "curated": true
  },
  {
    "id": "sp-parque-burle-marx",
    "name": "Parque Burle Marx",
    "coords": [
      -23.63222,
      -46.72139
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "São Paulo",
    "address": "Parque Burle Marx, São Paulo, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/19/Parque_Burle_Marx.jpg/330px-Parque_Burle_Marx.jpg",
    "photoCredit": "Alexandre Giesbrecht · CC BY 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Parque_Burle_Marx.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by/3.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_Burle_Marx",
    "coordinateSource": "https://pt.wikipedia.org/wiki/Parque_Burle_Marx",
    "curated": true
  },
  {
    "id": "sp-parque-do-carmo",
    "name": "Parque do Carmo",
    "coords": [
      -23.575,
      -46.46917
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "São Paulo",
    "address": "Parque do Carmo, São Paulo, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/Parque_do_Carmo_Sao_Paulo.JPG/330px-Parque_do_Carmo_Sao_Paulo.JPG",
    "photoCredit": "Icleao · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Parque_do_Carmo_Sao_Paulo.JPG",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_do_Carmo",
    "coordinateSource": "https://pt.wikipedia.org/wiki/Parque_do_Carmo",
    "curated": true
  },
  {
    "id": "sp-parque-ecologico-de-indaiatuba",
    "name": "Parque Ecológico de Indaiatuba",
    "coords": [
      -23.131555555556,
      -47.237861111111
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "Indaiatuba",
    "address": "Parque Ecológico de Indaiatuba, Indaiatuba, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/24/Lago_do_Parque_Ecol%C3%B3gico_-_Indaiatuba_-_panoramio.jpg/330px-Lago_do_Parque_Ecol%C3%B3gico_-_Indaiatuba_-_panoramio.jpg",
    "photoCredit": "Danilo Bertelli · CC BY 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Lago_do_Parque_Ecol%C3%B3gico_-_Indaiatuba_-_panoramio.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by/3.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_Ecol%C3%B3gico_de_Indaiatuba",
    "coordinateSource": "https://www.wikidata.org/wiki/Q17995940",
    "curated": true
  },
  {
    "id": "sp-parque-estadual-de-campos-do-jordao",
    "name": "Parque Estadual de Campos do Jordão",
    "aliases": [
      "Horto Florestal de Campos do Jordão"
    ],
    "coords": [
      -22.679332371,
      -45.469938561
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "Campos do Jordão",
    "address": "Parque Estadual de Campos do Jordão, Campos do Jordão, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c8/Arauc%C3%A1rias2.jpg/330px-Arauc%C3%A1rias2.jpg",
    "photoCredit": "Ana Taemi · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Arauc%C3%A1rias2.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_Estadual_de_Campos_do_Jord%C3%A3o",
    "coordinateSource": "https://www.waze.com/es/live-map/directions/horto-florestal-av.-pedro-paulo-campos-do-jordao?to=place.w.206112293.2061254003.1487520",
    "curated": true
  },
  {
    "id": "sp-parque-estadual-carlos-botelho",
    "name": "Parque Estadual Carlos Botelho",
    "coords": [
      -24.054939384440086,
      -47.99682208501278
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "São Miguel Arcanjo",
    "address": "Parque Estadual Carlos Botelho, São Miguel Arcanjo, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Estrada-Parque_Carlos_Botelho_2.jpg/330px-Estrada-Parque_Carlos_Botelho_2.jpg",
    "photoCredit": "olahbr · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Estrada-Parque_Carlos_Botelho_2.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://guiadeareasprotegidas.sp.gov.br/ap/parque-estadual-carlos-botelho/",
    "coordinateSource": "https://guiadeareasprotegidas.sp.gov.br/ap/parque-estadual-carlos-botelho/",
    "curated": true
  },
  {
    "id": "sp-petar-nucleo-santana",
    "name": "PETAR - Núcleo Santana",
    "aliases": [
      "Parque Estadual Turístico do Alto Ribeira",
      "Caverna Santana"
    ],
    "coords": [
      -24.5356549,
      -48.7004392
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "Iporanga",
    "address": "PETAR - Núcleo Santana, Iporanga, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/Regi%C3%A3o_do_PETAR.jpg/330px-Regi%C3%A3o_do_PETAR.jpg",
    "photoCredit": "Leandro wieczorek · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Regi%C3%A3o_do_PETAR.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://guiadeareasprotegidas.sp.gov.br/ap/parque-estadual-turistico-do-alto-ribeira-nucleo-santana/",
    "coordinateSource": "https://www.openstreetmap.org/way/76697038",
    "curated": true
  },
  {
    "id": "sp-parque-nascentes-do-tiete",
    "name": "Parque Nascentes do Tietê",
    "coords": [
      -23.5722801,
      -45.7357095
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "Salesópolis",
    "address": "Parque Nascentes do Tietê, Salesópolis, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Nascente_do_rio_Tiet%C3%AA_2.jpg/330px-Nascente_do_rio_Tiet%C3%AA_2.jpg",
    "photoCredit": "User:OS2Warp · Public domain",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Nascente_do_rio_Tiet%C3%AA_2.jpg",
    "sourceUrl": "https://www.daee.sp.gov.br/site/parquenascentesdotiete/",
    "coordinateSource": "https://www.openstreetmap.org/node/5930312948",
    "curated": true
  },
  {
    "id": "sp-parque-estadual-do-morro-do-diabo",
    "name": "Parque Estadual do Morro do Diabo",
    "coords": [
      -22.528950085205217,
      -52.29968748504135
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "Teodoro Sampaio",
    "address": "Parque Estadual do Morro do Diabo, Teodoro Sampaio, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/58/PEMD_-_Parque_Estadual_Morro_do_Diabo.jpg/330px-PEMD_-_Parque_Estadual_Morro_do_Diabo.jpg",
    "photoCredit": "Ipe-institutodepesquisasecologicas · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:PEMD_-_Parque_Estadual_Morro_do_Diabo.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://guiadeareasprotegidas.sp.gov.br/ap/parque-estadual-morro-do-diabo/",
    "coordinateSource": "https://guiadeareasprotegidas.sp.gov.br/ap/parque-estadual-morro-do-diabo/",
    "curated": true
  },
  {
    "id": "sp-parque-do-povo-de-presidente-prudente",
    "name": "Parque do Povo de Presidente Prudente",
    "coords": [
      -22.1252346,
      -51.4034935
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "Presidente Prudente",
    "address": "Parque do Povo de Presidente Prudente, Presidente Prudente, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/Parque_do_Povo_Prudente.JPG/330px-Parque_do_Povo_Prudente.JPG",
    "photoCredit": "LTS LTS · Public domain",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Parque_do_Povo_Prudente.JPG",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_do_Povo_(Presidente_Prudente)",
    "coordinateSource": "https://www.openstreetmap.org/relation/3071242",
    "curated": true
  },
  {
    "id": "sp-represa-municipal-de-sao-jose-do-rio-preto",
    "name": "Represa Municipal de São José do Rio Preto",
    "aliases": [
      "Parque da Represa Municipal",
      "Represa de Rio Preto"
    ],
    "coords": [
      -20.8102803,
      -49.3585109
    ],
    "kind": "lake",
    "category": "Lagos",
    "city": "São José do Rio Preto",
    "address": "Represa Municipal de São José do Rio Preto, São José do Rio Preto, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Represa_Municipal_de_S%C3%A3o_Jos%C3%A9_do_Rio_Preto.jpg/330px-Represa_Municipal_de_S%C3%A3o_Jos%C3%A9_do_Rio_Preto.jpg",
    "photoCredit": "Moca Trindade · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Represa_Municipal_de_S%C3%A3o_Jos%C3%A9_do_Rio_Preto.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_da_Represa_Municipal_de_S%C3%A3o_Jos%C3%A9_do_Rio_Preto",
    "coordinateSource": "https://www.waze.com/pt-BR/live-map/directions/br/sp/parque-da-represa-municipal?to=place.ChIJ3YenoldNvJQRAP1vZoHIDTM",
    "curated": true
  },
  {
    "id": "sp-thermas-dos-laranjais",
    "name": "Thermas dos Laranjais",
    "coords": [
      -20.7211842,
      -48.9163673
    ],
    "kind": "attraction",
    "category": "Lazer",
    "city": "Olímpia",
    "address": "Thermas dos Laranjais, Olímpia, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Thermas_dos_Laranjais%2C_Ol%C3%ADmpia_-_Parque_Aqu%C3%A1tico_com_%C3%A1guas_quentes_do_Aqu%C3%ADfero_Guaran%C3%AD%2C_ao_fundo_os_Hot%C3%A9is_e_Resorts_-_panoramio.jpg/330px-Thermas_dos_Laranjais%2C_Ol%C3%ADmpia_-_Parque_Aqu%C3%A1tico_com_%C3%A1guas_quentes_do_Aqu%C3%ADfero_Guaran%C3%AD%2C_ao_fundo_os_Hot%C3%A9is_e_Resorts_-_panoramio.jpg",
    "photoCredit": "MARCO AURÉLIO ESPARZ… · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Thermas_dos_Laranjais,_Ol%C3%ADmpia_-_Parque_Aqu%C3%A1tico_com_%C3%A1guas_quentes_do_Aqu%C3%ADfero_Guaran%C3%AD,_ao_fundo_os_Hot%C3%A9is_e_Resorts_-_panoramio.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Thermas_dos_Laranjais",
    "coordinateSource": "https://www.wikidata.org/wiki/Q28679515",
    "curated": true
  },
  {
    "id": "sp-jardim-botanico-municipal-de-bauru",
    "name": "Jardim Botânico Municipal de Bauru",
    "coords": [
      -22.343333333333334,
      -49.0175
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "Bauru",
    "address": "Jardim Botânico Municipal de Bauru, Bauru, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ed/Jardim_Bot%C3%A2nico_Bauru.jpg/330px-Jardim_Bot%C3%A2nico_Bauru.jpg",
    "photoCredit": "@thedeiwz · CC BY 2.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Jardim_Bot%C3%A2nico_Bauru.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by/2.0",
    "sourceUrl": "https://www.jardimbotanicobauru.com.br/",
    "coordinateSource": "https://www.wikidata.org/wiki/Q56693655",
    "curated": true
  },
  {
    "id": "sp-parque-ecologico-de-sao-carlos",
    "name": "Parque Ecológico de São Carlos",
    "coords": [
      -21.9875993,
      -47.8768807
    ],
    "kind": "park",
    "category": "Natureza",
    "city": "São Carlos",
    "address": "Parque Ecológico de São Carlos, São Carlos, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Imagem_da_entrada_do_Parque_Ecol%C3%B3gico_de_S%C3%A3o_Carlos.jpg/330px-Imagem_da_entrada_do_Parque_Ecol%C3%B3gico_de_S%C3%A3o_Carlos.jpg",
    "photoCredit": "EllenSaciloti · CC0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Imagem_da_entrada_do_Parque_Ecol%C3%B3gico_de_S%C3%A3o_Carlos.jpg",
    "photoLicense": "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Parque_Ecol%C3%B3gico_de_S%C3%A3o_Carlos",
    "coordinateSource": "https://www.wikidata.org/wiki/Q65160535",
    "curated": true
  },
  {
    "id": "sp-cachoeira-do-meu-deus",
    "name": "Cachoeira do Meu Deus",
    "aliases": [
      "Cachoeira Queda do Meu Deus",
      "Vale das Ostras"
    ],
    "coords": [
      -24.6223828,
      -48.3847386
    ],
    "kind": "waterfall",
    "category": "Cachoeiras",
    "city": "Eldorado",
    "address": "Cachoeira do Meu Deus, Eldorado, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Cachoeira_Queda_de_meu_Deus.jpg/330px-Cachoeira_Queda_de_meu_Deus.jpg",
    "photoCredit": "Luan Alves Chaves · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Cachoeira_Queda_de_meu_Deus.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://www.eldorado.sp.gov.br/portal/turismo/0/9/2872/cachoeira-queda-do-meu-deus-e-vale-das-ostras",
    "coordinateSource": "https://www.openstreetmap.org/node/3370209695",
    "curated": true
  },
  {
    "id": "sp-parque-dos-saltos",
    "name": "Parque dos Saltos",
    "coords": [
      -22.2915511,
      -48.1314345
    ],
    "kind": "waterfall",
    "category": "Cachoeiras",
    "city": "Brotas",
    "address": "Parque dos Saltos, Brotas, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/90/Parque_dos_Saltos_-_Rio_Jacar%C3%A9_Pepira_-_Brotas_-_panoramio.jpg/330px-Parque_dos_Saltos_-_Rio_Jacar%C3%A9_Pepira_-_Brotas_-_panoramio.jpg",
    "photoCredit": "MARCO AURÉLIO ESPARZ… · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Parque_dos_Saltos_-_Rio_Jacar%C3%A9_Pepira_-_Brotas_-_panoramio.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://www.turismopaulista.tur.br/atrativo/10_parque_dos_saltos_rio_jacare_pepira",
    "coordinateSource": "https://www.openstreetmap.org/way/682525540",
    "curated": true
  },
  {
    "id": "sp-estrada-parque-carlos-botelho",
    "name": "Estrada Parque Carlos Botelho",
    "aliases": [
      "SP-139",
      "Rodovia Nequinho Fogaça"
    ],
    "coords": [
      -24.0613464,
      -47.997995
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "São Miguel Arcanjo",
    "address": "Estrada Parque Carlos Botelho, São Miguel Arcanjo, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Estrada-Parque_Carlos_Botelho_2.jpg/330px-Estrada-Parque_Carlos_Botelho_2.jpg",
    "photoCredit": "olahbr · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Estrada-Parque_Carlos_Botelho_2.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://semil.sp.gov.br/2016/07/estrada-parque-carlos-botelho/",
    "coordinateSource": "https://www.openstreetmap.org/way/824919555",
    "curated": true
  }
];
