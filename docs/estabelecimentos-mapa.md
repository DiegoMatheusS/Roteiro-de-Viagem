# Balões, avaliações e relatos de estabelecimentos

O primeiro toque abre um balão ancorado à coordenada do ponto, nos mapas MapLibre e Leaflet. Há somente um balão selecionado. Os ícones não mostram nomes, preços nem destaque publicitário quando estão fechados.

No topo ficam as estrelas e a média das avaliações feitas no Rolê. Não se importam notas do Google nem se inventam avaliações. Postos mostram Gasolina, Etanol e Diesel; quando só há gasolina aditivada ou Diesel S10, o rótulo identifica a variante. Valores ausentes, desatualizados ou contestados não são apresentados como preços atuais.

**Indicar preço** abre diretamente o formulário de contribuição existente, sujeito à revisão administrativa. O nome do estabelecimento abre os detalhes completos. O **ⓘ** abre a avaliação de 1 a 5 estrelas e as perguntas:

- Estabelecimento não existe? Sim / Não
- Nome incorreto? Sim / Não
- Tipo de estabelecimento incorreto? Sim / Não

As três respostas são obrigatórias; a nota é opcional. O botão **Enviar** exige uma conta. Cada conta possui uma nota por local; enviar outra nota atualiza a anterior. Contas bloqueadas ou excluídas não entram na média pública. Relatos não alteram nem removem automaticamente os estabelecimentos. Respostas com algum “Sim” aparecem em **Solicitações → Denúncias**; avaliações sem problemas não criam uma denúncia aberta.

Os desenhos são compartilhados pelos dois motores: árvores em parques, máscaras de comédia e tragédia em teatros, gangorra em praças, cama em pousadas, bomba em postos, carrinho em mercados e símbolos próprios para as demais categorias. Importações antigas de praças cujo nome começa por “Praça” ou “Praca” e que ficaram sob parque/outro/atração recebem o pictograma de praça, sem modificar os dados cadastrados. Importações OSM novas reconhecem `place=square` e `leisure=playground`.

## E-mail do administrador

Configure no backend Railway, sem prefixo `VITE_` e sem incluir credenciais no APK:

| Variável | Conteúdo |
| --- | --- |
| `RESEND_API_KEY` | Chave privada de envio do Resend |
| `RDV_FEEDBACK_EMAIL_FROM` | Endereço remetente em domínio verificado no Resend |
| `RDV_FEEDBACK_EMAIL_TO` | Um único endereço de destino escolhido pelo proprietário |

O serviço usa o endpoint oficial [Send Email](https://resend.com/docs/api-reference/emails/send-email). Nenhum destinatário recebido do aplicativo é utilizado. O e-mail contém nome, tipo, endereço e localização do estabelecimento, a nota informada e as três respostas. Não inclui a senha, e-mail do viajante nem seu GPS.

Cada envio é registrado junto com uma mensagem pendente na mesma transação SQLite. O botão não perde o relato se o e-mail estiver sem configuração ou se o provedor falhar. Há tentativa imediata e novas tentativas a cada minuto, com recuo progressivo em caso de falha. Reiniciar o servidor preserva os envios pendentes. O identificador persistente do envio é usado como chave de idempotência no provedor; repetir a mesma solicitação não duplica a nota ou o relato.

**Configurações → Avisos de estabelecimentos por e-mail** informa se o serviço está configurado, o endereço de destino e quantos avisos aguardam envio. Configurar as três variáveis ativa as tentativas para os avisos já pendentes. “Respostas enviadas” no aplicativo confirma o registro no servidor; não afirma entrega na caixa de entrada.
