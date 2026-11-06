# API de endereços do Rolê

A busca funciona no próprio servidor e SQLite do Rolê. Não chama Photon,
Nominatim, Google, ViaCEP ou outro geocodificador. Não há chave ou cobrança por
consulta a esses serviços. A hospedagem e o disco continuam sendo os do projeto.

## Dados disponíveis

- Locais turísticos do catálogo, com os endereços e coordenadas já existentes.
- Estabelecimentos ativos e locais públicos já guardados no banco.
- Bases públicas importadas em NDJSON, sem consultas externas.
- Endereços escolhidos na origem/destino: histórico privado da conta e cópia
  no aparelho. Entradas feitas sem conexão são sincronizadas ao reconectar.
  A cópia do aparelho guarda os 200 mais recentes; o servidor conserva o histórico
  até a própria pessoa apagá-lo e pesquisa também os registros mais antigos.

Rua, número e CEP são campos separados. Bairro, cidade, UF e país também são
preservados quando conhecidos. Campos ausentes permanecem ausentes. O índice
acompanha edições e exclusões dos locais automaticamente. A migração mantém os
registros antigos; não depende da validade do antigo cache de geocodificação.

Essa base não contém automaticamente todos os imóveis do Brasil. Endereços
ausentes não recebem números ou coordenadas inventadas: o app permite marcar o
ponto no mapa e preencher número/CEP. Endereços pessoais não são publicados na
busca de outras contas. Mapas, cálculo de rotas e clima têm integrações próprias;
esta mudança remove a dependência externa da busca de endereços.

## Consultar

`GET /api/addresses/search?q=texto&lat=latitude&lng=longitude&limit=10`

- `q`: nome, rua, endereço ou CEP, entre 3 e 150 caracteres.
- `lat` e `lng`: opcionais, usados juntos para ordenar lugares equivalentes.
- `limit`: 1 a 20.
- A resposta contém `results`, `source: "role"`, `cached: true` e
  `externalRequests: 0`.
- Cada resultado tem `name`, `address`, `coords: [latitude, longitude]` e
  `addressParts` com `street`, `houseNumber`, `postcode`, `neighborhood`, `city`,
  `state` e `country`, conforme os dados disponíveis. CEP é normalizado para
  oito dígitos. Número e CEP pedidos precisam corresponder ao imóvel.
- `requiresPin: true` indica uma referência para posicionar o mapa; o usuário
  ainda precisa marcar o imóvel. Ela não confirma um número ausente.
- A rota antiga `/api/locations/search` é um alias desta busca, inclusive para
  APKs antigos. Não aciona provedores externos.

`GET /api/addresses/:id` consulta um endereço público por ID.

`GET /api/addresses/stats` mostra a quantidade de registros públicos por fonte.

## Histórico pessoal

As rotas abaixo exigem a sessão da própria conta:

- `POST /api/me/addresses`: `{selection, query, accountId}` após a escolha.
  Registros públicos são relidos da base para impedir alteração das coordenadas.
  Marcações manuais são aceitas apenas no histórico privado.
- `GET /api/me/addresses`: endereços recentes e locais privados já salvos.
- `DELETE /api/me/addresses`: limpa o histórico pessoal. Há também o botão
  **Limpar endereços recentes** em Perfil → Configurações.

## Ampliar a base sem geocodificador externo

Disponibilize um arquivo NDJSON de dados públicos/licenciados, um objeto por
linha, com `name` ou `street`, `address` ou campos de endereço, e `coords` no
formato `[latitude, longitude]`. Campos opcionais: `id`, `houseNumber`,
`postcode`, `neighborhood`, `city`, `state`, `country`, `category`, `sourceUrl`.
Identificadores importados ficam no namespace `import:` e não sobrescrevem
locais cadastrados. Use um ID estável na origem para atualizar o mesmo registro.

Execute `npm run addresses:import -- caminho/enderecos.ndjson` no servidor que
possui o banco, com `DATABASE_PATH` apontando para o mesmo arquivo da API. A
importação confirma lotes de mil registros; erros informam a linha e a quantidade
já confirmada. Nenhum arquivo é enviado a outro serviço.

Há índices para CEP/número e busca textual com abreviações, acentos e prefixos.
O limite de proteção por IP é do próprio servidor; não é uma cota de terceiros.
