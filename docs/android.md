# Android: compilar, instalar e validar

A interface é embutida no app; a conta, tarifas, previsão e Comboio usam o backend HTTPS. O código público da origem é configuração de build, não credencial. Uma compilação de CI sem origem serve para testes nativos, não para distribuir um app conectado.

O endereço padrão é `https://roteiro-api-production.up.railway.app`; `RDV_API_URL` substitui esse endereço quando necessário. Testes de emulador usam uma origem local fechada para não consultar contas do serviço real.

## APK para seu celular

1. Mescle as PRs e publique o backend.
2. Abra GitHub → Actions → **Validar Android** → **Run workflow**.
3. Informe a origem HTTPS sem `/api`, caminho ou parâmetros; escolha `debug`.
4. Baixe `roteiro-android-debug` quando o build terminar. Extraia e instale `app-debug.apk`.

O pacote de teste tem nome **Roteiro de Viagem (Teste)** e ID `br.com.roteirodeviagem.app.debug`. Ele pode coexistir com o pacote release. Builds debug de máquinas diferentes podem ter assinaturas diferentes; para atualizar a mesma instalação, use a mesma chave debug. Não desinstale um app com alterações offline pendentes antes de sincronizar seus dados.

### Corrigir login Google (erro 10 / DEVELOPER_ERROR)

O login nativo usa `requestIdToken(GOOGLE_CLIENT_ID)` com **OAuth Client ID do tipo Web** configurado no backend. Além dele, o projeto no **Google Cloud Console → APIs e serviços → Credenciais** precisa de um OAuth Client ID do tipo **Android** para cada pacote/assinatura:

- APK debug de testes: pacote `br.com.roteirodeviagem.app.debug` + **SHA-1** do certificado que assinou o APK instalado.
- APK release: pacote `br.com.roteirodeviagem.app` + **SHA-1** da chave de release (ou da chave de assinatura da Play Store, se a loja reassinar).

**Importante:** o APK debug gerado pelo GitHub Actions normalmente tem uma chave temporária por runner. Registrar apenas o SHA-1 de um APK antigo não resolve os próximos. Para tornar o APK de teste estável, configure os quatro secrets `RDV_KEYSTORE_BASE64`, `RDV_STORE_PASSWORD`, `RDV_KEY_ALIAS` e `RDV_KEY_PASSWORD` com a **mesma chave persistente** usada no fluxo de assinatura do proprietário. Em `main` e em execução manual, o workflow passa a assinar o pacote `.debug` com essa chave quando todos os secrets estiverem disponíveis; em PRs, nunca expõe esses secrets. Sem secrets, continua produzindo APK de teste, mas **o login Google pode falhar com código 10**.

Confira o SHA-1 do APK efetivamente instalado com o `apksigner` do Android SDK (Windows, PowerShell):

```powershell
& "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat" verify --print-certs "app-debug.apk"
```

No Google Cloud, use esse SHA-1 e o pacote **exato**; o tipo Web do `GOOGLE_CLIENT_ID` no Railway deve pertencer ao mesmo projeto OAuth. Não cole chaves privadas, secrets nem senhas no repositório ou na conversa.

No computador: Node 24, JDK 21, Android SDK 36 e Android Studio. PowerShell:

```powershell
$env:RDV_API_URL="https://origem-real-do-backend"
npm ci
npm run android:sync
npm run android:open
```

## Release do proprietário

A assinatura definitiva deve ficar com o proprietário. Guarde o keystore e as senhas fora do repositório, com uma cópia recuperável. Não envie a senha no chat nem a coloque em arquivo versionado.

Crie a chave no seu computador somente se ainda não houver chave desse aplicativo:

```powershell
keytool -genkeypair -v -keystore roteiro-release.jks -alias roteiro -keyalg RSA -keysize 3072 -validity 10000
```

O comando pede as informações e a senha interativamente. Para o GitHub Actions, cadastre estes **repository secrets**: `RDV_KEYSTORE_BASE64`, `RDV_STORE_PASSWORD`, `RDV_KEY_ALIAS`, `RDV_KEY_PASSWORD`. O primeiro é o conteúdo do keystore em Base64. Execute **Validar Android** com `release`, origem real, `version_name` e `version_code` crescente. O workflow gera APK assinado para instalação direta e AAB para a Play Console, e remove a chave temporária ao terminar. Não publica automaticamente na loja.

Para compilar no computador, configure `RDV_KEYSTORE_FILE` com o caminho absoluto e as variáveis de assinatura acima, além de `RDV_VERSION_NAME` e `RDV_VERSION_CODE`, e execute `npm run android:release`. Se faltar a chave, o endereço ou o número de versão, a compilação para distribuição será recusada.

Se o armazenamento de artifacts do GitHub estiver cheio, é preciso liberar artifacts antigos ou aguardar a atualização da cota antes de baixar o pacote. O build não esconde essa falha na etapa de disponibilização.

Pushes na branch `main` também geram o pacote de teste conectado. A pasta `android-dist` contém APK/AAB de preparação, assinados apenas com a chave descartável de CI, e o `apksigner.jar` para aplicar a chave definitiva fora do runner. Os arquivos `roteiro-para-assinar` precisam ser assinados pelo proprietário antes da distribuição; a chave privada definitiva nunca é incluída nesses artefatos.

## Testes automatizados

**Validar Android** compila APK debug, testes instrumentados, APK release e AAB. O release de CI usa uma chave descartável, apaga esses pacotes ao terminar e não serve para instalação ou publicação; a distribuição usa a chave do proprietário.

**Testar Android no emulador** executa testes instrumentados em Android 13/API 33 e Android 16/API 36. Usa coordenadas, sessão e servidor HTTPS controlados somente no APK de testes. Confere movimento e checkpoint com tela apagada, envio do Comboio, interrupção pelo botão da notificação, impedimento de reinício automático e retomada explícita. Também confere a exigência de permissão precisa e os intents de discagem/composição. Nenhuma ligação ou mensagem real é enviada.

O fluxo web confere cadastro e remoção de contatos, cópia e composição com coordenada recente, DDI sem duplicação e permissão de localização negada. O botão SOS abre o discador ou uma mensagem: a confirmação da ligação/envio acontece no app escolhido.

## Validar no aparelho físico

O emulador não reproduz bateria, antena ou políticas de cada fabricante. Em um celular Android 13–16:

- Instale o APK conectado ao backend, entre e confira perfil/garagem vazios na conta nova.
- Em Ajustes → Segurança & SOS, confira **Situação do Android**, ative GPS/precisão e cadastre um contato de teste. Confira os dados antes de compartilhar.
- Inicie uma viagem e um Comboio com outro aparelho. Ative o compartilhamento em cada conta e mova os aparelhos em condições seguras. Confira o mapa do outro participante.
- Volte ao menu, abra outro app e bloqueie a tela por 30 minutos. Confira a notificação, as posições recentes e a distância medida.
- Desligue e religue a internet; posições com mais de três minutos devem sumir e posições novas devem voltar.
- Toque em **Parar GPS** na notificação. Confira a interrupção da viagem e do Comboio; recarregar o app não deve reativá-los sem uma ação explícita.
- Teste permissão aproximada/negada, GPS desligado, notificação negada, economia de bateria, parada pelo sistema, logout e troca de conta. Use **Permissões do app**, **Abrir GPS** e **Notificações** para corrigir cada configuração.
- Abra o SOS, confira coordenada/precisão, copie o texto e teste o contato autorizado. A ligação e a mensagem exigem sua confirmação. Não faça chamadas de teste para números públicos de emergência.

A distribuição pública depende de um backend real, chave de assinatura do proprietário, validação física e configuração da conta de distribuição. A cobertura dos provedores e de tarifas colaborativas continua parcial.
