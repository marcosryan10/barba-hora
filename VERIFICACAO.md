# Verificação da entrega — 03/11/2026

## Verificado automaticamente

- `npm run typecheck`: aplicativo TypeScript sem erros.
- `deno check supabase/functions/send-push/index.ts`: função de envio verificada no ambiente Deno, sem erros de tipos. O envio real não foi exercitado.
- `npm test`: 22 verificações executadas com PostgreSQL embarcado (PGlite), aplicando a migração real.
- Exportação Expo/Hermes para Android e iOS: pacotes de JavaScript gerados para as duas plataformas. Não é um build binário assinado.

Os testes cobrem cadastro sem privilégio de administrador, impedimento de autoatribuição de admin, leitura restrita de perfis/reservas/avisos, reserva e aviso na mesma transação, snapshot de valor/duração, horário repetido, sobreposição, intervalo adjacente, tentativas de alteração direta de reserva/preço, cancelamento indevido, liberação de intervalo, datas passadas, mudança de preço antes da confirmação, leitura administrativa, bloqueios, edição indevida de serviços e tokens e restrição da edição de avisos.

## Limites da verificação

Foi gerado um APK Android independente com assinatura de teste, compilado em modo release para arm64-v8a e x86_64 (Android 7/API 24 ou superior). A assinatura APK v2 foi verificada com `apksigner`, e o pacote foi instalado e iniciado no emulador Android conectado. A tela inicial sem configuração de Supabase foi inspecionada visualmente. Houve correção da quebra de linha do título após essa inspeção. O arquivo fica em `../barba-hora-teste.apk`.

Sem conexão com Supabase remoto, testes de dois celulares, APNs/FCM, IPA, assinatura de produção ou submissão às lojas. Concorrência real entre conexões remotas não foi exercitada; há trava transacional e restrição de exclusão no banco, além dos testes de conflito em sequência. Visual dos fluxos autenticados, teclado, fontes grandes, consumo e permissões ainda precisam de teste em dispositivos físicos. O teste no emulador confirma apenas a instalação e a abertura da tela de configuração desta compilação.

Para a compilação local no ambiente Windows desta sessão, foi usado JDK 17, Gradle 8.14.3 e uma pasta temporária CMake mais curta para evitar o limite de caminhos do Windows. Esses ajustes se aplicam ao projeto Android gerado localmente; o projeto canônico continua sendo o Expo com `app.config.ts`.

O `npm audit` aponta 13 avisos nas dependências transitivas do SDK Expo 57 (2 baixos, 9 moderados, 2 altos), incluindo ferramentas CLI/configuração. `npm audit fix` foi executado; os avisos remanescentes exigem avaliação de atualização maior/compatibilidade. Não foi forçada uma migração do SDK nem troca de Zod 3 por 4 dentro do CLI. Reavalie dependências antes de distribuir em produção.

Push possui função de envio, webhook documentado, registro de tokens, consulta de recibos e repetição por job. A entrega de notificações e os secrets não foram configurados nesta sessão; não há alegação de push funcionando em produção. O estado `delivered` no registro corresponde ao recibo do provedor, sem confirmação de leitura humana.
