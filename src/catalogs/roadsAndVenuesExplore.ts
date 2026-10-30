import type {ExplorePlace} from '../types/explore';

// Existing scenic roads keep their original identities in the other catalogs.
// Each new destination retains its location source and photograph credit.
export const ROADS_AND_VENUES_EXPLORE_CATALOG: readonly ExplorePlace[] = [
  {
    "id": "sp-estrada-do-gomeral",
    "name": "Estrada do Gomeral",
    "aliases": [
      "Estrada Cênica do Gomeral",
      "Estrada Cênica Jorge Boueri"
    ],
    "coords": [
      -22.7173015,
      -45.4036309
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Guaratinguetá",
    "address": "Estrada do Gomeral, trecho da Mantiqueira entre Guaratinguetá e Campos do Jordão, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Gomeral_-_Guaratinguet%C3%A1_01.JPG/330px-Gomeral_-_Guaratinguet%C3%A1_01.JPG",
    "photoCredit": "douglas marcel ramos gomes · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Gomeral_-_Guaratinguet%C3%A1_01.JPG",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://guaratingueta.sp.gov.br/reuniao-com-o-departamento-de-estradas-de-rodagem-de-sp/",
    "coordinateSource": "https://www.openstreetmap.org/way/30471473",
    "curated": true
  },
  {
    "id": "sp-serra-de-sao-pedro",
    "name": "Serra de São Pedro",
    "aliases": [
      "Serra do Itaqueri",
      "Rodovia Elísio de Paula Teixeira"
    ],
    "coords": [
      -22.5188142,
      -47.9262279
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "São Pedro",
    "address": "Rodovia Municipal Elísio de Paula Teixeira, subida da Serra do Itaqueri, São Pedro, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/Serra_de_S%C3%A3o_Pedro_-_panoramio.jpg/330px-Serra_de_S%C3%A3o_Pedro_-_panoramio.jpg",
    "photoCredit": "Jose Roberto V. Mora… · CC BY 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Serra_de_S%C3%A3o_Pedro_-_panoramio.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by/3.0",
    "sourceUrl": "https://www.saopedro.sp.gov.br/portal/noticias/0/3/18048/guarda-civil-e-defesa-civil-fazem-acao-de-orientacao-sobre-o-transito-na-serra",
    "coordinateSource": "https://www.openstreetmap.org/node/2658846207",
    "curated": true
  },
  {
    "id": "sp-rodovia-floriano-rodrigues-pinheiro",
    "name": "Rodovia Floriano Rodrigues Pinheiro",
    "aliases": [
      "SP-123",
      "Floriano R. Pinheiro"
    ],
    "coords": [
      -22.810319,
      -45.6306829
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Santo Antônio do Pinhal",
    "address": "SP-123, trecho da Serra da Mantiqueira entre Taubaté e Campos do Jordão, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/09/Rodovia_Floriano_Rodrigues_Pinheiro_visto_do_Mirante_de_N._Sra_Auxiliadora.jpg/330px-Rodovia_Floriano_Rodrigues_Pinheiro_visto_do_Mirante_de_N._Sra_Auxiliadora.jpg",
    "photoCredit": "Themium · CC0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Rodovia_Floriano_Rodrigues_Pinheiro_visto_do_Mirante_de_N._Sra_Auxiliadora.jpg",
    "photoLicense": "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "sourceUrl": "https://www.der.sp.gov.br/WebSite/MalhaRodoviaria/Denominacoes.aspx",
    "coordinateSource": "https://www.openstreetmap.org/way/743456662",
    "curated": true
  },
  {
    "id": "sp-rodovia-dos-tamoios",
    "name": "Rodovia dos Tamoios",
    "aliases": [
      "SP-099",
      "SP-99",
      "Serra dos Tamoios"
    ],
    "coords": [
      -23.5800075,
      -45.4642517
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Caraguatatuba",
    "address": "SP-099, trecho de serra entre São José dos Campos e Caraguatatuba, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/TamoiosSerra.JPG/330px-TamoiosSerra.JPG",
    "photoCredit": "Cacobianchi · CC BY-SA 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:TamoiosSerra.JPG",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/3.0",
    "sourceUrl": "https://www23.concessionariatamoios.com.br/a-rodovia/a-rodovia",
    "coordinateSource": "https://www.openstreetmap.org/way/648762833",
    "curated": true
  },
  {
    "id": "sp-rodovia-dos-imigrantes",
    "name": "Rodovia dos Imigrantes",
    "aliases": [
      "SP-160",
      "Sistema Anchieta-Imigrantes"
    ],
    "coords": [
      -23.9090494,
      -46.4462048
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Cubatão",
    "address": "SP-160, trecho da Serra do Mar entre São Paulo e a Baixada Santista, SP",
    "photo": "https://upload.wikimedia.org/wikipedia/commons/9/91/Estrada_de_Santos_-_Rodovia_dos_Imigrantes.jpg",
    "photoCredit": "Thomas Hobbs · CC BY-SA 2.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Estrada_de_Santos_-_Rodovia_dos_Imigrantes.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/2.0",
    "sourceUrl": "https://www.ecoviasimigrantes.com.br/condicoes-da-via",
    "coordinateSource": "https://www.openstreetmap.org/way/142700910",
    "curated": true
  },
  {
    "id": "sp-rodovia-anchieta",
    "name": "Rodovia Anchieta",
    "aliases": [
      "SP-150",
      "Via Anchieta"
    ],
    "coords": [
      -23.9065103,
      -46.4251393
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Cubatão",
    "address": "SP-150, trecho da Serra do Mar entre São Paulo e a Baixada Santista, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Via_Anchieta.jpg/330px-Via_Anchieta.jpg",
    "photoCredit": "User:OS2Warp · Public domain",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Via_Anchieta.jpg",
    "sourceUrl": "https://www.ecoviasimigrantes.com.br/condicoes-da-via",
    "coordinateSource": "https://www.openstreetmap.org/way/4626699",
    "curated": true
  },
  {
    "id": "sp-rodovia-mogi-bertioga",
    "name": "Rodovia Mogi–Bertioga",
    "aliases": [
      "SP-098",
      "SP-98",
      "Mogi Bertioga",
      "Rodovia Dom Paulo Rolim Loureiro"
    ],
    "coords": [
      -23.7364301,
      -46.0380923
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Bertioga",
    "address": "SP-098, trecho de serra entre Mogi das Cruzes e Bertioga, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Libera%C3%A7%C3%A3o_total_da_rodovia_Mogi-Bertioga_altura_do_KM_82_%2852732758326%29.jpg/330px-Libera%C3%A7%C3%A3o_total_da_rodovia_Mogi-Bertioga_altura_do_KM_82_%2852732758326%29.jpg",
    "photoCredit": "Governo do Estado de São Paulo · CC BY 2.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Libera%C3%A7%C3%A3o_total_da_rodovia_Mogi-Bertioga_altura_do_KM_82_(52732758326).jpg",
    "photoLicense": "https://creativecommons.org/licenses/by/2.0",
    "sourceUrl": "https://www.parceriaseminvestimentos.sp.gov.br/sec-parcerias-investimentos/canaisComunicacao/noticias/cronograma_obrasmelhoria_lotelitoral",
    "coordinateSource": "https://www.openstreetmap.org/way/477776021",
    "curated": true
  },
  {
    "id": "sp-estrada-do-vinho",
    "name": "Estrada do Vinho",
    "aliases": [
      "Roteiro do Vinho",
      "SPV-077"
    ],
    "coords": [
      -23.5783025,
      -47.1394385
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "São Roque",
    "address": "Estrada do Vinho, circuito de São Roque, SP",
    "photo": "https://www.roteirodovinho.com.br/assets/img/fotos/IMG_5482.jpg",
    "photoCredit": "Roteiro do Vinho – São Roque",
    "photoPage": "https://www.roteirodovinho.com.br/",
    "sourceUrl": "https://www.roteirodovinho.com.br/duvidas",
    "coordinateSource": "https://www.openstreetmap.org/way/225119951",
    "curated": true
  },
  {
    "id": "sp-estrada-das-cabras",
    "name": "Estrada das Cabras",
    "aliases": [
      "Joaquim Egídio",
      "Serra das Cabras",
      "CAM-245"
    ],
    "coords": [
      -22.8825882,
      -46.8545415
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Campinas",
    "address": "Estrada das Cabras, distrito de Joaquim Egídio, Campinas, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/89/Serra_das_Cabras_-_Joaquim_Eg%C3%ADdio.JPG/330px-Serra_das_Cabras_-_Joaquim_Eg%C3%ADdio.JPG",
    "photoCredit": "Fasouzafreitas · CC BY 3.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Serra_das_Cabras_-_Joaquim_Eg%C3%ADdio.JPG",
    "photoLicense": "https://creativecommons.org/licenses/by/3.0",
    "sourceUrl": "https://picodascabras.com.br/contato/",
    "coordinateSource": "https://www.openstreetmap.org/node/1404825006",
    "curated": true
  },
  {
    "id": "sp-rota-das-cavernas",
    "name": "Rota das Cavernas",
    "aliases": [
      "SP-165",
      "Rodovia Benedito Pascoal de França",
      "Eldorado a Iporanga"
    ],
    "coords": [
      -24.5709307,
      -48.5551522
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Iporanga",
    "address": "SP-165, Rodovia Benedito Pascoal de França, trecho entre Eldorado e Iporanga, SP",
    "photo": "https://spstatefilmcommission.org.br/wp-content/uploads/jet-form-builder/fe5ec8d14e42cfd31ac91258cc6df3ff/2025/08/Eldorado_RodBeneditoPascoaldeF-3-1.jpg",
    "photoCredit": "São Paulo State Film Commission / Prefeitura de Iporanga",
    "photoPage": "https://spstatefilmcommission.org.br/pt/cadastros/rodovia-benedito-pascoal-de-franca/",
    "sourceUrl": "https://spstatefilmcommission.org.br/pt/cadastros/rodovia-benedito-pascoal-de-franca/",
    "coordinateSource": "https://www.openstreetmap.org/way/31611828",
    "curated": true
  },
  {
    "id": "sp-rodovia-casimiro-teixeira",
    "name": "Rodovia Prefeito Casimiro Teixeira",
    "aliases": [
      "SP-222",
      "Rodovia Prefeito Casemiro Teixeira",
      "Estrada do Biguá"
    ],
    "coords": [
      -24.5748006,
      -47.5522346
    ],
    "kind": "scenic_road",
    "category": "Estrada",
    "city": "Iguape",
    "address": "SP-222, trecho entre Biguá (Miracatu) e Iguape, SP",
    "photo": "https://cdn1.bs9.com.br/Folder/2026/07/50022228-7fca-4226-a9f1-802df9b2bfb7/conversions/rodovia-sp-222-bigua-iguape-em-obras-medium.webp",
    "photoCredit": "Reprodução/Facebook · BS9",
    "photoPage": "https://www.bs9.com.br/vale-do-ribeira/2022/03/27/rodovia-em-iguape-passa-por-obras-em-toda-a-sua-extensao.html",
    "sourceUrl": "https://turismo.iguape.sp.gov.br/-como-chegar/",
    "coordinateSource": "https://www.openstreetmap.org/way/332449763",
    "curated": true
  },
  {
    "id": "sp-autodromo-de-interlagos",
    "name": "Autódromo de Interlagos",
    "aliases": [
      "Autódromo José Carlos Pace",
      "Autódromo Internacional José Carlos Pace"
    ],
    "coords": [
      -23.7018189,
      -46.696924
    ],
    "kind": "attraction",
    "category": "Autódromos",
    "city": "São Paulo",
    "address": "Avenida Senador Teotônio Vilela, 261, Interlagos, São Paulo, SP",
    "photo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ed/Aut%C3%B3dromo_de_Interlagos_em_Dezembro_de_2023.jpg/330px-Aut%C3%B3dromo_de_Interlagos_em_Dezembro_de_2023.jpg",
    "photoCredit": "Boaventuravinicius · CC BY-SA 4.0",
    "photoPage": "https://commons.wikimedia.org/wiki/File:Aut%C3%B3dromo_de_Interlagos_em_Dezembro_de_2023.jpg",
    "photoLicense": "https://creativecommons.org/licenses/by-sa/4.0",
    "sourceUrl": "https://autodromodeinterlagos.prefeitura.sp.gov.br/en/contato",
    "coordinateSource": "https://www.openstreetmap.org/relation/2560355",
    "curated": true
  },
  {
    "id": "sp-autodromo-velocitta",
    "name": "Autódromo Velocitta",
    "aliases": [
      "Autódromo Velo Città",
      "Velo Città",
      "Fazenda Velocitta"
    ],
    "coords": [
      -22.288891,
      -46.8482858
    ],
    "kind": "attraction",
    "category": "Autódromos",
    "city": "Mogi Guaçu",
    "address": "Rodovia SP-342, km 187, Nova Louzã, Mogi Guaçu, SP",
    "photo": "https://uxyznloldrydorabirru.supabase.co/storage/v1/render/image/public/media/montagem_de_conteudo_itens/v6emIbIg7Y3eRubCnTIMBHA87wfv1e/thumb-autodromo-2.webp?width=640&resize=contain&quality=75",
    "photoCredit": "Autódromo Velocitta",
    "photoPage": "https://www.autodromovelocitta.com.br/",
    "sourceUrl": "https://autodromovelocitta.com.br/contato",
    "coordinateSource": "https://www.openstreetmap.org/way/439630883",
    "curated": true
  },
  {
    "id": "sp-autodromo-capuava",
    "name": "Autódromo Capuava",
    "aliases": [
      "Autódromo Fazenda Capuava",
      "Fazenda Capuava"
    ],
    "coords": [
      -23.0634139,
      -47.1004453
    ],
    "kind": "attraction",
    "category": "Autódromos",
    "city": "Indaiatuba",
    "address": "Rodovia SP-324, km 88, Jardim São Domingos, Indaiatuba, SP",
    "photo": "https://static.wixstatic.com/media/609775_e27a35d865354f5e9137d6c0b81c34e4~mv2.jpg/v1/fill/w_640,h_480,q_85/capuava.jpg",
    "photoCredit": "Autódromo Capuava",
    "photoPage": "https://www.autodromocapuava.com.br/",
    "sourceUrl": "https://www.autodromocapuava.com.br/",
    "coordinateSource": "https://www.openstreetmap.org/relation/20673405",
    "curated": true
  },
  {
    "id": "sp-autodromo-ecpa",
    "name": "Autódromo do ECPA",
    "aliases": [
      "Autódromo de Piracicaba",
      "Esporte Clube Piracicabano de Automobilismo",
      "ECPA"
    ],
    "coords": [
      -22.7387296,
      -47.5336573
    ],
    "kind": "attraction",
    "category": "Autódromos",
    "city": "Piracicaba",
    "address": "Rodovia SP-135, km 13,5, Piracicaba, SP",
    "photo": "https://ecpa.com.br/img/servicos/departamento/autodromo.png",
    "photoCredit": "ECPA",
    "photoPage": "https://ecpa.com.br/capa.asp?s=servico&idservico=1067",
    "sourceUrl": "https://ecpa.com.br/capa.asp?pi=contato",
    "coordinateSource": "https://www.openstreetmap.org/relation/19345029",
    "curated": true
  },
  {
    "id": "sp-sambodromo-do-anhembi",
    "name": "Sambódromo do Anhembi",
    "aliases": [
      "Polo Cultural e Esportivo Grande Otelo",
      "Passarela Cultural do Anhembi"
    ],
    "coords": [
      -23.516492,
      -46.6452063
    ],
    "kind": "attraction",
    "category": "Cultura",
    "city": "São Paulo",
    "address": "Avenida Olavo Fontoura, 1209, Santana, São Paulo, SP",
    "photo": "https://distritoanhembi.com.br/wp-content/uploads/2026/04/sambodromo-2-1.jpg",
    "photoCredit": "Distrito Anhembi",
    "photoPage": "https://distritoanhembi.com.br/sambodromo/",
    "sourceUrl": "https://distritoanhembi.com.br/sambodromo/",
    "coordinateSource": "https://www.openstreetmap.org/way/203621979",
    "curated": true
  }
];
