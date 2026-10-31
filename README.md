# LaveMais — site público e área do cliente

**E-mails:** `npm run emails:preview` abre prévias locais em `http://127.0.0.1:3100`, sem envio. Consulte `EMAILS.md` para modelos, escopo de integração, validação e publicação da logo de e-mail.

**Entrega de 30/10/2026:** consulte `PRODUCAO.md` e `AUDITORIA-PRODUCAO.md`. Antes de executar esta versão com Supabase, aplique `supabase/migrations/20261030_appointment_requests.sql` após a baseline `supabase/schema.sql`. A nova API `/api/client/appointments` registra solicitações pendentes (criação, listagem, edição e cancelamento com histórico); não confirma reservas e não notifica a equipe. A migração não foi executada no banco remoto.

Aplicação Node.js/Express com autenticação própria (bcrypt + JWT HttpOnly). O banco é escolhido por `DATABASE_BACKEND=mongo|supabase`; Supabase Auth não é usado. Não há fallback automático entre bancos.

## Requisitos e setup

- Node.js 24.15.0 (ou versão 24 posterior); `.nvmrc` fixa Node 24.15.0 para desenvolvimento e CI.
- Execute `npm ci`, copie `.env.example` para `.env` e configure um backend.
- MongoDB: `DATABASE_BACKEND=mongo`, `MONGODB_URI` incluindo o nome do banco e acesso de rede autorizado no Atlas.
- Supabase: `DATABASE_BACKEND=supabase`, `SUPABASE_URL` HTTPS e `SUPABASE_SERVICE_ROLE_KEY`. Execute **todo** `supabase/schema.sql` como administrador no SQL Editor antes de iniciar. O script é transacional e pode ser reaplicado. Ele cria tabela, RPCs, índices, RLS e revoga acesso de `anon`/`authenticated`. Nunca use a chave privilegiada no navegador. `SUPABASE_ANON_KEY` não é usada pelo servidor.
- Gere `JWT_SECRET` com `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Não publique `.env`.
- Se ambos os bancos estiverem configurados, a escolha explícita é obrigatória. No `.env` local deste checkout foi explicitado Supabase para preservar o destino da migração; para trabalhar com Atlas, altere para `mongo`.
- SMTP é opcional: deixe host/usuário/senha/remetente todos vazios para desabilitar, ou configure todos. Porta 465 usa TLS; 587 exige STARTTLS. Valide remetente autorizado e SPF/DKIM/DMARC no provedor.
- `npm start` ou `npm run dev`; abra `http://localhost:3000`. O servidor local aguarda banco e índices. Se faltar esquema/permissão, falha com mensagem sanitizada em vez de fingir conexão.
- `TRUST_PROXY` vazio usa conexão direta. Atrás de proxy, configure **somente** IPs/CIDRs confiáveis da infraestrutura. Não use `true` ou contagem de saltos. Confira o IP efetivo em homologação; uma configuração errada pode agrupar usuários no mesmo limite. Na Vercel, o limitador usa o `X-Forwarded-For` sobrescrito pela plataforma; em outros hosts ignora esse cabeçalho sem proxy confiável. IPv6 é agrupado por /64. Confira o comportamento em Preview. Referências: [Vercel](https://vercel.com/docs/headers/request-headers) e [Express](https://expressjs.com/en/guide/behind-proxies/).

## Rotas existentes

| Rota | Comportamento |
| --- | --- |
| `GET /`, `/index.html` | Home pública |
| `GET /login`, `/cadastro` | Login/cadastro; destino privado permitido preservado |
| `GET /recuperar-senha`, `/recuperar-senha.html` | Pedido de código e nova senha |
| `GET /conta`, `/conta/:section` | Dashboard autenticado |
| `POST /api/auth/register` | Cadastro, unicidade e hash bcrypt |
| `POST /api/auth/login` | Cookie HttpOnly, SameSite Strict, Secure em produção/Preview |
| `GET /api/auth/me` | Sessão atual |
| `POST /api/auth/logout` | Limpa cookie e revoga o JWT emitido, inclusive cópias |
| `POST /api/auth/password-reset/request` | Código de 6 dígitos, validade de 10 min, intervalo de 1 min |
| `POST /api/auth/password-reset/confirm` | Consumo atômico de uso único; invalida sessões anteriores |
| `GET/PATCH /api/client/profile` | Perfil próprio; só nome, telefone e nascimento são editáveis |
| `GET /api/health` | Verifica acesso real ao banco; retorna 503 se indisponível |

Seções privadas: `inicio`, `agendamentos`, `servicos`, `planos`, `beneficios`, `perfil`, `sobre`. Respostas de API, login e conta usam `Cache-Control: no-store`. Não há API pública que aceite ID arbitrário para editar o perfil de outro cliente.

Os limites são persistidos no banco, compartilhados entre instâncias: cadastro/login compartilham 10 tentativas por IP/15 min; pedidos de recuperação têm 5/IP/hora; confirmação tem 10/IP/15 min e 10/e-mail/15 min. Os identificadores dos buckets são HMAC, sem guardar e-mail/IP em texto. Limites por e-mail resistem a troca de IP. As janelas são fixas, portanto pode haver até dois limites em rápida sequência na fronteira de janelas. Mongo remove buckets/revogações expirados por TTL; Supabase remove expirados durante incrementos. Falha no armazenamento não desativa silenciosamente a proteção.

## Conteúdo e escopo do produto

Edite **`public/site-content.js`** para preencher somente informações comerciais confirmadas: contato, WhatsApp, endereço, horários, Maps, serviços, preços, história, termos e privacidade. Todos os assets ficam em `public/`, fonte única para Express e Vercel. As páginas HTML ficam na raiz para não expor o dashboard sem a rota protegida.

Recargas e bônus são informações de oferta; não existe compra online, saldo ou lançamento de créditos. Confirme valores antes de publicar. Solicitações de atendimento possuem backend; confirmação de reservas, contratação/pagamento de planos, fidelidade e cupons permanecem pendentes. Contato WhatsApp não confirma reserva. Não há implementação de Supabase Auth nem migração automática de contas ao trocar de backend.

Publique a política de privacidade e os termos reais em URLs verificadas; defina uso, retenção, exclusão e atendimento a pedidos sobre dados pessoais com o responsável pelo negócio. Não foram inventados documentos ou contatos para preencher essas lacunas. Mudança de e-mail exige procedimento de suporte com verificação de identidade; não é liberada pelo formulário.

## Migração MongoDB → Supabase

1. Faça backup restaurável da origem e do destino e teste a restauração em ambiente isolado.
2. Aplique `supabase/schema.sql` no destino; confira RLS/grants no painel. As funções `lavemais_*` devem ser acessíveis só a `service_role`.
3. Pause escritas durante validação/importação/corte. Não opere os dois bancos como fontes simultâneas.
4. Configure `MONGODB_MIGRATION_URI` explicitamente para a origem; o script nunca assume `MONGODB_URI`. Configure a URL e a chave privilegiada do destino.
5. Execute `npm run migrate:users`: é **dry-run**, valida a origem e compara o destino sem inserir. Não imprime dados pessoais, hashes ou credenciais.
6. Depois de revisar contagens, execute `npm run migrate:users -- --apply`. Insere somente contas ausentes, com UUID determinístico e `legacy_mongo_id`; preserva bcrypt, datas e campos do perfil. Não sobrescreve contas em conflito. Não importa códigos de recuperação nem JWTs anteriores.
7. Rode novamente sem `--apply`: `pending: 0` e contagens reconciliadas indicam a conclusão. O importador carrega os registros pendentes em memória, adequado ao estágio atual; para grandes volumes, use lotes com staging e validação equivalente.
8. Troque `DATABASE_BACKEND` para `supabase`, faça novo deploy e valide login/perfil/reset. Clientes precisam entrar novamente. O UUID novo impede que sessões Mongo apontem para linhas Supabase.
9. Em falha, mantenha escritas pausadas e volte ao backend anterior. Se já houve escrita no destino, reconcilie-a antes de voltar para evitar perda. Preserve backups e o registro das contagens. Um erro durante inserções pode deixar um lote parcial; a execução seguinte compara e retoma sem sobrescrever.

O SQL é uma baseline reaplicável e também atualiza o esquema legado deste repositório. Mudanças futuras devem ser registradas em migrações incrementais revisadas, com backup antes de alterações estruturais.

## Testes e verificações

- `npm run check`: verifica sintaxe do servidor, fontes, scripts e assets.
- `npm test`: testes isolados sem carregar `.env`, incluindo PostgreSQL embarcado PGlite para executar o SQL real (sem a extensão pgcrypto, pois UUID já faz parte do PostgreSQL), reaplicação do esquema, permissões, cooldown, expiração e consumo único. A integração HTTP Supabase usa um transporte PostgREST simulado ligado ao PostgreSQL embarcado e SMTP simulado; não acessa clientes nem envia e-mails reais.
- `npm run test:integration`: teste Mongo real. Exige `MONGODB_TEST_URI` explícita, diferente da principal, com banco dedicado descartável. Nunca usa fallback para produção. O runner carrega `.env` apenas para este comando e habilita `RUN_DATABASE_TESTS=true`; `npm test` mantém o teste externo ignorado.
- `npm audit --omit=dev`: consulta vulnerabilidades; CI roda instalação reproduzível, sintaxe, testes e audit.

Os testes locais não substituem o smoke test com os serviços reais. Antes da liberação, valide cadastro duplicado, login incorreto/correto, acesso privado sem cookie, edição de perfil, logout e tentativa de reutilizar token, reset entregue, código vencido/usado, invalidação da sessão antiga e limites. Confira console do navegador, teclado/leitor de tela, telas móveis, links comerciais e URLs profundas.

## Deploy Vercel

1. Importe o repositório na raiz, usando runtime Node 24 compatível com `.nvmrc`; não configure pasta de saída ou build customizado. `vercel.json` usa Express, inclui HTMLs e permite 30 s por função. `public/` é servido pela plataforma.
2. Configure backend, credenciais e JWT em **Preview** e **Production** separadamente. Não reutilize banco de produção em Preview; não configure URI de testes no deploy. O código não conecta durante build; conecta na primeira requisição que depende de banco, incluindo login com cookie.
3. Atlas: autorize a saída de rede da infraestrutura, preferindo saída estática quando disponível. Supabase: aplique o esquema e use só chave de servidor; verifique acesso anônimo negado antes do corte.
4. Confira `/api/health`, todas as páginas e assets, cookies `Secure/HttpOnly/SameSite`, redirects e fluxos privados em Preview. O site público continua disponível durante indisponibilidade de banco no deploy.
5. Teste SMTP real e tempo total. O fetch Supabase tem limite de 5 s por operação; SMTP tem timeouts reduzidos. Monitore latência e falhas antes de promover o Preview.
6. Configure na plataforma alertas de 5xx/503, latência, falhas SMTP e uptime. Os logs registram método, caminho e erro sanitizado, sem corpos de requisição. Defina responsável por incidentes, backups e restauração. Revogue credenciais caso tenham sido expostas fora deste checkout.

A logo original é `public/logo-lavemais.png`. A imagem ilustrativa `public/lavemais-hero.jpg` é de Chris Weiher no Unsplash, sob licença Unsplash.

## Reforço de segurança e privacidade

Consulte `SEGURANCA-OPERACIONAL.md` antes de publicar: esta versão exige a migração `supabase/migrations/20261031_mfa.sql` no Supabase. MFA TOTP é configurado em Minha conta > Perfil quando `MFA_ENCRYPTION_KEY` está presente. `REQUIRE_STAFF_MFA=true` exige ativação para a equipe. Backup isolado e WAF dependem de configuração externa. Políticas: `/privacidade` e `/cookies`; completar os dados da empresa e as definições operacionais antes de afirmar conformidade LGPD.

Login Google: consultar `GOOGLE-LOGIN.md`. Requer migração `20261031_google_login.sql` quando habilitado, credenciais OAuth e APP_BASE_URL; não há ativação automática na conta Google Cloud.
