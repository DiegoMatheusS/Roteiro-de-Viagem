# Radares no servidor do Rolê

A base pública [Pardal](https://github.com/murkiriel/pardal) fica no mesmo SQLite
configurado em `DATABASE_PATH`, no volume persistente já usado pelo Rolê. Não há
outro serviço, banco ou API de radares contratada.

Na primeira inicialização em produção, o servidor baixa a última release e salva
radares fixos, trechos e fiscalização de semáforos, incluindo localização, limite
informado, sentido quando disponível, origem e estado ativo/inativo. Valores
ausentes continuam desconhecidos. Não são dados de radares móveis em tempo real.

A próxima consulta é um mês de calendário após a conferência bem-sucedida, com
ajuste para o último dia nos meses curtos. A data fica no banco: reiniciar o
servidor não baixa tudo novamente. Um temporizador confere a data localmente a
cada seis horas, então a consulta acontece até seis horas após o vencimento.
Se a versão tem o mesmo SHA-256, somente a data da conferência é atualizada.

O ZIP tem limite de tamanho e hash conferido antes da leitura. O pacote inteiro
é validado antes de alterar o banco. A substituição é transacional, atualiza os
mesmos identificadores, remove registros ausentes e conserva registros inativos
fora das consultas de navegação. Uma falha mantém a última base completa, marca
a situação na API e permite nova tentativa após 24 horas, também persistida.
O agendamento só funciona enquanto o serviço está em execução; ao voltar, ele
confere uma atualização vencida respeitando o intervalo de retentativa.

`PARDAL_ENABLED=0` desativa as atualizações. Produção ativa por padrão;
`PARDAL_ENABLED=1` permite testar a importação em desenvolvimento.
Testes unitários não iniciam downloads reais.

## Consultas

- `GET /api/radars/status`: total/ativos, versão, data da fonte, última importação,
  última conferência, próxima conferência e indicação de falha/atraso.
- `POST /api/road-alerts/route`: mantém o contrato existente e acrescenta os
  radares ativos próximos ao traçado. Retorna `source: "pardal"`, `cameraKind`,
  `limitKmh`, `directionDegrees`, `dataSource` e `datasetUpdatedAt` em cada radar.
  Os relatos da comunidade continuam separados, com a moderação existente.
- `GET /api/radars/export.csv`: cópia integral do CSV público importado, incluindo
  inativos, sem contas, rotas privadas ou dados pessoais do banco.
- `GET /api/radars/license`: atribuição e licença recebidas no pacote.

As consultas de navegação usam somente o banco. A seleção tem tolerância lateral
de 80 m e compara o sentido informado com os segmentos da rota (até 60° de
diferença). Posições aproximadas, vias paralelas ou sobrepostas continuam sendo
limitações: coordenadas não identificam o nível de um viaduto. Radares de trecho
avisam pela entrada cadastrada, sem calcular velocidade média. Sem sentido
informado, os dois sentidos são considerados. No cliente, o próximo aviso também
usa progresso e distância pela rota. `expiresAt` limita a validade da resposta
em cache do cliente e não apaga os radares persistidos.

## Atribuição

Dados sob **ODbL 1.0**, © colaboradores do OpenStreetMap e fontes públicas
indicadas pelo Pardal. A base derivada continua sob a mesma licença e o CSV
original está disponível pela API. A fonte de cada radar e os links de
atribuição aparecem em seus detalhes. A base é comunitária, sem garantia de
cobertura completa, e a sinalização da via prevalece.
