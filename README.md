# Roteiro de Viagem

Aplicativo React/Vite para planejar passeios de carro e moto, com garagem, histórico, mapa, Comboio de Viagem e preços colaborativos de combustíveis.

## Executar localmente

Requisito: Node.js **22.18 ou superior** (recomendado: Node.js 24).

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. O comando inicia o frontend e a API na porta 3001. O banco SQLite é criado automaticamente em `data/roteiro.sqlite`. Contas, sessões, postos reais, preços, votos, denúncias, ações de moderação e conteúdo das fotografias ficam no banco. O diretório `data/` é privado e não entra no Git.

O OCR usa Tesseract local e um modelo distribuído nas dependências. **Não precisa de chave do Gemini ou OpenAI.** A primeira leitura pode levar alguns segundos.

## Como contribuir

1. Abra o mapa e toque no ícone de um posto real.
2. Confira preços, tipo de combustível, data de observação, origem, confiabilidade e horário conhecido.
3. Entre na conta ou cadastre uma conta para informar um preço, enviar foto, confirmar, contestar ou denunciar.
4. Ao enviar foto, confira e corrija os valores lidos. A publicação exige o botão **Confirmar e publicar**.
5. Fotos ficam privadas até aprovação da moderação. Elas são reprocessadas sem EXIF, GPS ou nome original. O dono pode remover suas fotos.

Nunca há preços pré-cadastrados ou inferidos quando a informação não existe. A ausência aparece como **sem preço informado**. Preços observados há mais de 72 horas continuam visíveis como **desatualizados**, mas não entram na comparação. Valores incompatíveis com a faixa de validação ou com contribuições recentes aguardam moderação.

A confiabilidade considera idade da observação, confirmações, contestações e histórico de contribuições confirmadas. Cada conta pode ter um voto por preço e não pode confirmar o próprio preço. Há limites por usuário/IP, intervalo entre contribuições iguais, limite diário e fila de denúncias.

Fotografe e use os controles somente com o veículo parado. Evite imagens com rostos, placas de veículos e dados pessoais.

## Comparar postos e calcular custos

No planejamento, abra **Encontrar combustível mais barato**. Informe o combustível compatível com o veículo, consumo nesse combustível, combustível restante e quantidade a abastecer. Opcionalmente, informe a saída planejada.

O comparador usa postos do OpenStreetMap/Overpass e distâncias rodoviárias do OSRM. Compara abastecimento mais combustível do desvio, distância até o posto e autonomia estimada. Preços antigos ou com contestação predominante são excluídos. Postos fora da autonomia ou fechados no horário de chegada, quando esse horário foi verificado, não são recomendados. Horários sem verificação ou sem interpretação segura permanecem desconhecidos.

A consulta é limitada a oito postos com preços recentes por comparação, e a tela informa candidatos não consultados e desvios indisponíveis. Não há substituição por distância em linha reta quando a API de roteamento falha. **Usar preço no cálculo da viagem** atualiza o orçamento e guarda o posto, a contribuição e a data usados. Sem preço escolhido ou informado, o orçamento é identificado como parcial.

## Moderação

Crie primeiro a conta do moderador pelo aplicativo. Depois, no terminal do servidor:

```bash
npm run moderator -- email-da-conta
```

Entre novamente ou atualize a página. O botão **Moderação** abre fotos pendentes, preços incompatíveis e denúncias. Revisores podem aprovar/rejeitar e registrar uma nota. Fotos só devem ser aprovadas quando os preços estiverem legíveis e não houver dados pessoais expostos. Denunciar uma foto a torna privada novamente até revisão. Na ficha do posto, o moderador também pode registrar um horário confirmado diretamente com o estabelecimento.

Cadastros públicos nunca recebem permissão de moderador automaticamente. Sessões usam cookies HttpOnly e as senhas ficam protegidas por scrypt. A API valida identidade, limites, valores, datas, origem das solicitações e permissão em cada alteração.

## Configuração e execução em servidor

As opções estão em `.env.example`. Use `.env` para configurar portas, caminho do banco, domínio e provedores de mapas. Os servidores públicos de mapas podem ficar indisponíveis ou limitar consultas; o aplicativo informa a falha e só reutiliza estabelecimentos já consultados, sem inventar preços. Para uso com tráfego real, configure provedores adequados ao volume pelo `OVERPASS_URL` e `ROUTING_URL`.

```bash
npm run build
npm run start
```

Para servir frontend e API juntos, configure `NODE_ENV=production`, `PUBLIC_APP_URL` com a origem HTTPS pública, e `API_PORT` com a porta do servidor. Em produção os cookies são Secure. Use HTTPS e preserve o banco e o diretório `data/` em volume persistente; faça backups do SQLite incluindo as fotografias. Esta versão usa uma instância de API por banco SQLite.

## Verificação

```bash
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

O GitHub Actions executa tipos, regressões, OCR real, build e fluxo mobile. Os testes de interface usam provedores de mapas controlados **apenas dentro dos testes**, sem inserir postos fictícios no aplicativo real.

## Limites atuais do restante do aplicativo

O motor antigo de sugestões turísticas, clima e pedágios ainda gera prévias ilustrativas, identificadas na tela. Garagem, perfil e roteiros continuam salvos no navegador. O Comboio de Viagem ainda é local, sem sincronização entre celulares; a leitura do GPS e o consentimento local foram corrigidos. A distância da viagem é medida enquanto a sessão está aberta, sem garantia de execução em segundo plano ou continuidade após recarregar a página. O SOS usa uma localização recente do dispositivo e não envia coordenadas fixas quando o GPS falha.
