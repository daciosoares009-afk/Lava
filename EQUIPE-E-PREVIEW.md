# Validação de e-mail, mobile e equipe — 30/10/2026

## Evidências desta etapa

- SMTP: conexão TLS e autenticação com o provedor verificadas com `verify()`. Não comprova entrega na caixa de entrada.
- Recuperação: primeira chamada HTTP retornou 200 genérico. A consulta restrita ao ID da conta autorizada confirmou que o endereço informado não estava cadastrado no Supabase configurado. Nenhum código foi enviado por esse pedido; nenhum código ou senha foi lido ou impresso. Nova verificação ao fim dos trabalhos manteve a conta ausente.
- Site existente `https://lava-sand.vercel.app/api/health`: HTTP 200. Não foi criado nem publicado um novo deployment.
- Navegador real: home, menu móvel (abrir/fechar e acessar login), login, cadastro e recuperação em viewport 390×844 sem overflow horizontal; recuperação também em 320×740 sem overflow horizontal. Não equivale a teste em hardware físico. Área privada e painel da equipe ainda precisam de validação visual autenticada.
- Testes automatizados: suíte ampliada com acesso de equipe, estados, histórico e notificação com claim exclusivo. 32 aprovados, zero falhas, um ignorado (Mongo externo). PostgreSQL embarcado, SMTP isolado e HTTP local; sem alteração de atendimento de cliente no banco remoto.

## Fluxo da equipe implementado

1. Cliente registra solicitação pendente; pagamento exclusivamente na unidade.
2. O servidor tenta enviar aviso genérico para a caixa da equipe. Sem nome, telefone, observações ou código de acesso no e-mail. Link usa apenas `APP_BASE_URL` definido no servidor.
3. Equipe entra com conta normal e abre `/equipe`. A autorização depende do UUID em `STAFF_USER_IDS`, não de e-mail digitado em formulário ou claim do cliente.
4. Painel permite filtrar e paginar, consultar nome/telefone/observações, conferir capacidade por procedimento operacional e confirmar ou cancelar. A confirmação exige uma orientação pública ao cliente (informar horário combinado). Não há alocação automática de máquinas nem garantia automática contra conflitos de capacidade.
5. A equipe pode concluir um atendimento confirmado. Transições e versões são verificadas atomicamente no banco; cada decisão registra autor, instante, origem, destino e orientação no histórico.
6. Cliente consulta situação e orientação na conta; depois da confirmação, não pode sobrescrever a decisão por edição. Para alterar, deve contatar a unidade. Não há registro automático de pagamento.

O fluxo novo é Supabase; o backend Mongo mantém as solicitações básicas e não habilita o painel da equipe. Esta limitação é explícita na configuração.

## Avisos e falhas

O estado de envio é persistido na própria solicitação. A gravação do pedido nunca é desfeita se o SMTP falhar. Uma tentativa exclusiva usa lease de cinco minutos e até cinco tentativas por solicitação. O painel mostra falha/pendência e permite tentar novamente. Não há worker ou cron automático: verifique a fila regularmente. Um encerramento do processo entre o envio SMTP e a confirmação no banco pode gerar aviso duplicado em nova tentativa; o painel é a fonte da situação atual. `sent` significa aceitação pelo SMTP, não comprovação de leitura ou entrega final. Solicitações antigas entram como pendentes de aviso, mas só serão reenviadas se a equipe solicitar.

## Ativação no ambiente local

1. Criar a conta autorizada pelo dono do negócio no cadastro da própria aplicação. Confirmar controle dessa conta usando recuperação de senha com entrega real. Não promover uma conta somente por coincidência de e-mail (o cadastro não verifica o e-mail).
2. No SQL Editor do projeto existente, executar **somente** `supabase/migrations/20261030_staff_workflow.sql`, após a migração de solicitações que já foi aplicada. O script mantém dados existentes e amplia os estados permitidos; não remove tabela ou registros. Ainda não foi executado remotamente nesta etapa.
3. Configurar no servidor, sem publicar valores em frontend:

   ```dotenv
   STAFF_USER_IDS=UUID_DA_CONTA_AUTORIZADA
   STAFF_NOTIFICATION_EMAIL=EMAIL_AUTORIZADO_DA_EQUIPE
   APP_BASE_URL=http://localhost:3000
   ```

4. Reiniciar `npm start`. O servidor verifica a presença das colunas da equipe quando o recurso é habilitado. Sem configuração de equipe, fluxos atuais continuam operando sem a nova migração.
5. Fazer login e abrir `/equipe`. Testar com solicitação explicitamente destinada a teste, confirmar data/horário combinado e verificar a orientação na conta do cliente. Conferir que outra conta recebe 403 ao tentar acessar o painel/API.
6. Confirmar recebimento de um aviso e testar retry em ambiente isolado. Não cadastrar clientes como massa de teste.

## Preview na Vercel

O projeto público informado é `lava-sand.vercel.app`; falta sessão de gerenciamento autenticada para localizar o projeto e criar o deployment de Preview. A CLI não está instalada/autenticada e não há token Vercel disponível. Tela de login aberta no navegador; nenhuma credencial nova foi solicitada no chat.

Após entrar no painel:

1. Localizar o projeto ligado a esse domínio e confirmar repositório `daciosoares009-afk/Lava`. Não assumir que a branch principal representa as alterações locais: há arquivos ainda sem commit/push.
2. Usar uma branch de revisão para o Preview; não promover para Production nesta etapa. Preservar arquivos locais anteriores e não incluir `.env`.
3. Configurar o ambiente **Preview** com banco Supabase isolado, credenciais SMTP autorizadas, JWT próprio, `DATABASE_BACKEND=supabase`, Node 24 e as novas variáveis de equipe. Não reutilizar banco de clientes no Preview. Aplicar baseline e migrações no banco de homologação autorizado.
4. Configurar `APP_BASE_URL` com a origem HTTPS estável desse Preview (sem caminho, query, credenciais ou fragmento). O link dos avisos não usa Host fornecido pela requisição.
5. Usar `vercel.json` existente: Express, sem output directory ou build customizado; `equipe.html` fica no pacote pela regra `*.html`.
6. Validar `/api/health`, rotas profundas, assets, cookie Secure/HttpOnly/SameSite, autenticação, reset real, solicitações, painel com duas contas, entrega do aviso e mobile autenticado.
7. Somente depois desses resultados revisar a liberação pública. O pedido atual é Preview, não promoção automática para produção.

## Arquivos desta etapa

Criados: `equipe.html`, `public/equipe.js`, `src/staffAccess.js`, `src/staffNotifications.js`, `src/routes/staff.js`, `src/staffWorkflow.test.js`, `supabase/migrations/20261030_staff_workflow.sql`, este relatório.

Modificados: configuração/checagem de banco, montagem de rotas no servidor, repositório e API de solicitações, dashboard do cliente, informação de pagamento na home, `.env.example`, fixture PostgreSQL e teste de integração HTTP.
