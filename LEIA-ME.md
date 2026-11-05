# Barba & Hora — Android e iPhone

Aplicativo nativo em React Native + Expo, com backend Supabase. Não é um site nem um WebView. O nome, os valores iniciais e o identificador `com.suabarbearia.barbahora` são provisórios e editáveis.

## O que está implementado

- Cadastro e login por e-mail/senha; perfil com nome e celular. A sessão usa armazenamento seguro do sistema.
- Cliente escolhe serviço, dia e horário, revisa valor/duração e confirma. Consulta histórico e cancela reservas futuras.
- Administrador consulta agenda por data, nome/telefone do cliente, serviço, valor e status; cancela e conclui atendimentos.
- Gestão de serviços, preços, duração, expediente semanal, bloqueios e lista de clientes.
- Uma cadeira/barbeiro. Horários em America/Sao_Paulo, intervalos de 15 minutos e janela de reservas de até 60 dias no servidor (30 dias oferecidos no seletor).
- Reserva e aviso persistente na mesma transação; central de avisos com lidos/não lidos, atualização por Realtime e registro de dispositivo para push Android/iOS.
- Função de servidor para envio imediato via webhook, tentativas posteriores e consulta de recibos do Expo.
- Regras de acesso por usuário no banco; administrador não pode ser escolhido pelo cadastro. Restrição de exclusão do PostgreSQL impede intervalos sobrepostos, além de serialização das operações de agenda.

## Estado desta entrega

O código-fonte está preparado e foi gerado um APK Android independente, com assinatura de teste, em `../barba-hora-teste.apk`. Não há Supabase remoto conectado, contas reais criadas, IPA assinado, publicação nas lojas nem teste em aparelhos físicos. Este APK abre a tela de configuração até que o Supabase seja configurado e uma nova compilação seja gerada. As notificações push **não estão ativadas** até executar a configuração abaixo. Uma notificação push depende da internet, da permissão do aparelho e da entrega de Apple/Google; não se pode garantir recebimento instantâneo em toda condição. O aviso no banco é criado imediatamente na confirmação da reserva e permanece disponível no painel.

Os testes automatizados usam PostgreSQL embarcado via PGlite para executar a migração e as políticas reais. Eles não simulam o sistema operacional do celular, a infraestrutura Realtime do Supabase ou a entrega APNs/FCM. Veja `VERIFICACAO.md` para os resultados desta sessão.

## 1. Rodar o aplicativo

Requisitos: Node.js 22 ou posterior, npm, uma conta Supabase e uma conta Expo/EAS para builds.

```powershell
npm ci
Copy-Item .env.example .env
```

Preencha `.env` com a URL e a chave pública do seu projeto Supabase. Nunca coloque `service_role`, senha do banco, segredo do webhook ou token privado do Expo em variáveis `EXPO_PUBLIC_*`.

```powershell
npm start
```

Sem as variáveis, o aplicativo abre uma tela explicando a configuração necessária. Para explorar as telas no Expo Go, use um celular compatível com o SDK 57; o fluxo completo de push deve ser testado em build próprio.

## 2. Banco e autenticação

1. Crie um projeto Supabase da barbearia.
2. Execute todo o arquivo `supabase/migrations/001_barbershop.sql` no SQL Editor, uma única vez em banco novo. Alternativamente vincule a CLI ao projeto e aplique a migração com `supabase db push`.
3. Ative autenticação por e-mail/senha. Configure envio de e-mails/SMTP e confirmação de e-mail. O usuário confirma pelo link e depois entra no aplicativo. Configure os URLs permitidos no Supabase conforme seu ambiente.
4. Cadastre a conta do dono no aplicativo como conta normal, confirme o e-mail e execute no SQL Editor (substitua o e-mail):

```sql
insert into public.admins(user_id)
select id from auth.users where email = 'dono@sua-barbearia.com'
on conflict do nothing;
```

5. Saia e entre novamente. O aplicativo abre a agenda do administrador. Não há senha padrão.
6. Cadastre/ajuste valores e expediente em Gestão. As reservas já feitas preservam o preço e a duração contratados. Alterar expediente ou adicionar bloqueios não cancela reservas existentes; trate esses atendimentos na agenda.

## 3. Android e iPhone: builds nativos

Defina os identificadores definitivos em `app.config.ts` antes da primeira publicação.

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
```

O EAS pode gravar o ID diretamente na configuração. Se não conseguir editar o arquivo TypeScript, adicione `EAS_PROJECT_ID=UUID-RETORNADO` ao `.env` e às variáveis do ambiente de build EAS. As duas variáveis públicas do Supabase também precisam existir no EAS para os builds.

```powershell
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

O perfil de desenvolvimento inclui `expo-dev-client`. O build iOS para aparelho exige conta Apple Developer e provisionamento dos dispositivos. O build em nuvem do EAS permite gerar iOS a partir do Windows; a compilação iOS local requer macOS/Xcode.

Para distribuir um APK de teste e uma versão de produção:

```powershell
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform all
```

Para iPhone, use distribuição interna com provisionamento ou TestFlight. Não existe APK para iPhone. Build e publicação podem gerar cobranças das plataformas; nenhum build pago foi iniciado nesta entrega.

## 4. Push imediato para o dono

### Credenciais e dispositivo

1. Configure FCM v1 para Android e APNs para iOS nas credenciais EAS. Para Android, forneça `google-services.json` pelo arquivo secreto EAS/variável `GOOGLE_SERVICES_JSON` usada em `app.config.ts`; a conta de serviço FCM é configurada nas credenciais EAS, nunca embutida no app.
2. Gere e instale um build próprio com `expo-notifications`. Expo Go não é validação suficiente para push.
3. Entre como dono e toque em **Conta → Ativar avisos neste celular**. A permissão só é solicitada nessa ação. O token é gravado no banco e removido ao sair da conta nesse aparelho.

### Função de envio e webhook

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase secrets set PUSH_WEBHOOK_SECRET=SEGREDO_ALEATORIO_LONGO
npx supabase functions deploy send-push --no-verify-jwt
```

O segredo deve ser criado e mantido pelo dono do projeto. A função usa a URL e a service role disponíveis no ambiente seguro das Edge Functions. Se a segurança por token do serviço Expo estiver habilitada, configure também `EXPO_ACCESS_TOKEN` como secret da função.

No Dashboard Supabase → Database → Webhooks, crie um webhook:

| Campo | Valor |
| --- | --- |
| Tabela | `public.notifications` |
| Evento | INSERT |
| Método | POST |
| URL | `https://SEU_PROJECT_REF.supabase.co/functions/v1/send-push` |
| Cabeçalhos | `Content-Type: application/json` e `x-webhook-secret: MESMO_SEGREDO` |

A verificação JWT é desativada apenas para esse endpoint; o segredo do cabeçalho é obrigatório. Não exponha o segredo no aplicativo.

O webhook dispara depois do commit da reserva. O servidor consulta os administradores e seus dispositivos, envia a mensagem com nome, dia e hora, e salva o ticket. Cada par aviso/dispositivo tem controle de tentativa para evitar disparos concorrentes duplicados. Em falha de rede ambígua, uma nova tentativa pode gerar duplicata; esse é um sistema com repetição possível, não entrega exatamente uma vez.

### Recuperação e recibos

Configure um job Supabase Cron a cada minuto para chamar a mesma URL por POST com corpo `{}` e o mesmo cabeçalho secreto. Use Supabase Vault para guardar URL/segredo ao montar a chamada com `pg_net`; não grave secrets no repositório. O job reprocessa avisos das últimas 24h (máximo de 100 por execução), recupera tentativas travadas há 5 minutos e consulta recibos após 15 minutos. Se a barbearia atingir esse volume, aumente a paginação antes de usar em produção.

`push_deliveries` é uma tabela operacional acessível apenas ao servidor/SQL Editor. `accepted` significa ticket aceito pelo Expo; `delivered` significa recibo positivo do provedor, não prova de que a pessoa viu o aviso. Erros permanentes ficam em `error`; após corrigir credenciais, um operador pode alterar esses registros para `retry`. Tokens `DeviceNotRegistered` são removidos automaticamente.

O dono consegue consultar os avisos no aplicativo mesmo quando o push falha. Ao abrir/retomar o app, o painel busca a contagem atual. O botão de ativação confirma somente o registro do celular, sem prometer que o servidor já está configurado.

## 5. Verificação antes de uso real

```powershell
npm run typecheck
npm test
npx expo export --platform ios --platform android
```

Em dois celulares físicos (cliente e dono), valide uma reserva, recepção no painel, aviso com app do dono fechado, toque na notificação, cancelamento e liberação do intervalo. Tente reservar o mesmo horário em duas contas ao mesmo tempo; só uma deve confirmar. Valide permissões negadas, dispositivo offline, fontes grandes e teclado em ambas as plataformas.

A exportação do JavaScript/Hermes verifica os pacotes por plataforma; não equivale a um APK/IPA compilado, assinado e instalado. Não há gateway de pagamento: o valor é informativo, com pagamento na barbearia. Recuperação de senha, vários barbeiros e pagamento online não fazem parte desta versão.

## Referências oficiais

- [Configurar push com Expo](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Envio de push e recibos](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Webhooks do Supabase](https://supabase.com/docs/guides/database/webhooks)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
