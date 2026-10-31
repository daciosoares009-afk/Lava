# Entrega de produção — 30/10/2026

Nova etapa de equipe, e-mail real, mobile e Preview: consulte `EQUIPE-E-PREVIEW.md` para o estado atualizado, evidências, nova migração e bloqueios externos.

## Atualização após aplicação manual

O usuário informou ter executado a migração no SQL Editor. A verificação remota subsequente, somente de leitura, confirmou conexão da aplicação, `lavemais_health` saudável e acesso à estrutura `appointment_requests` com os campos exigidos pelo servidor. O bloqueio de migração ausente descrito no histórico abaixo está resolvido. Esta checagem não valida CRUD remoto, entrega SMTP ou deploy.

Decisão comercial confirmada: pagamentos exclusivamente presenciais. Gateway, checkout, webhooks e cobrança online não fazem parte do escopo. O pagamento deve ser informado como realizado na unidade; eventual registro de recebimento depende de ação autorizada da equipe, sem confirmação automática.

## Resultado e limites

Implementados no código e validados localmente: solicitações de atendimento com criação, listagem paginada (20 por página), filtros de status, edição e cancelamento persistido. Todas as consultas restringem o proprietário autenticado; proprietário e status não são atribuíveis por formulário. Alterações concorrentes usam uma revisão condicional atômica. Cancelamento mantém o histórico, sem endpoint de exclusão definitiva. Validação de campos, limites de escrita, carregamento, erros, sucesso e prevenção de inserção de HTML na lista.

Os dados são gravados no backend selecionado, sem mock na aplicação. O fluxo é uma **solicitação pendente**, não uma reserva confirmada: não bloqueia máquina/horário, não cobra e não notifica equipe. Não é possível considerar a operação comercial completa sem um processo de atendimento e confirmação. Contato direto com a unidade continua necessário.

Segurança corrigida: limitador passa a usar identidade normalizada (IPv6 /64 e cabeçalhos somente no ambiente Vercel); escritas com `Sec-Fetch-Site: cross-site` são recusadas. A aplicação continua same-origin, sem liberar CORS arbitrário. Cookies, autenticação existente e layout foram preservados.

## Arquivos

Criados:
- `AUDITORIA-PRODUCAO.md`: inventário e prioridades anteriores à implementação.
- `PRODUCAO.md`: este relatório e procedimento de liberação.
- `src/appointmentValidation.js`: validação estrita e datas no fuso America/Sao_Paulo.
- `src/appointments.js`: repositório Supabase e modelo/repositório Mongo.
- `src/routes/appointments.js`: API autenticada e controle de concorrência.
- `src/appointmentValidation.test.js`: validação e permissões SQL.
- `supabase/migrations/20261030_appointment_requests.sql`: migração aditiva.

Modificados:
- `server.js`: API e proteção contra escritas cross-site.
- `src/db.js`: índices Mongo e verificação de presença da migração Supabase na inicialização.
- `src/securityStore.js`: aplicação efetiva da identidade normalizada.
- `dashboard.html`, `public/dashboard.js`, `public/dashboard.css`: formulário, histórico, filtros e ações.
- `test-support/postgres.js`: SQL da migração e suporte à paginação no transporte de testes.
- `src/frontend.test.js`, `src/supabase.integration.test.js`, `src/vercel.test.js`: cobertura funcional e regressões.
- `README.md`: referência obrigatória à nova migração.

## Banco

Nova tabela `appointment_requests`, FK para `users`, índice composto por proprietário/data/id, restrições de tamanho/status/revisão, timestamps e trigger de atualização. RLS habilitada, acesso de public/anon/authenticated revogado; service_role recebe somente SELECT/INSERT/UPDATE. A autorização por proprietário é feita no servidor porque service_role ignora RLS. Função health passa a verificar a tabela. Sem alterações destrutivas, sem exclusão de dados e sem migração remota executada.

Em consulta remota somente leitura, `lavemais_health` existente respondeu HTTP 200; a consulta sem linhas à nova tabela retornou HTTP 404 / PGRST205. A tabela não está disponível no PostgREST do ambiente configurado. É preciso aplicar a migração e conferir o schema cache. O novo código recusa inicialização do banco se essa migração estiver ausente. Não substituir o código em produção antes de aplicar e validar o SQL.

## Verificação

- `npm test`: 29 aprovados, zero falhas, um ignorado na suíte com 30 testes, incluindo a execução final após ampliar a paginação. Abrange autenticação, recuperação SMTP com transporte isolado, perfil, revogação, permissões SQL, reaplicação da migração, datas, isolamento entre contas, concorrência por versão, paginação sem sobreposição, UI e cold start Vercel.
- `npm run check`: sintaxe JavaScript aprovada. Não há etapa de compilação/bundler; Express executa as fontes e serve os assets.
- `git diff --check`: sem erros de whitespace.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilidades conhecidas no registro consultado nesta entrega.
- Testes HTTP exigiram acesso a loopback fora do sandbox; a execução restrita inicial falhou por EACCES.
- Não foram executados CRUD remoto, envio SMTP real, testes de carga, inspeção visual em navegador real ou deploy. O transporte de teste Supabase usa PostgreSQL embarcado real, mas não substitui o PostgREST hospedado.
- Mongo externo não testado: requer banco dedicado em `MONGODB_TEST_URI`; não usar produção para testes.

## Variáveis

Não foram adicionadas variáveis. Neste checkout a configuração de Supabase, JWT e SMTP está preenchida; valores não foram impressos ou alterados. Preenchimento não comprova SMTP operacional.

Obrigatórias no deploy Supabase: `DATABASE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` aleatório com pelo menos 32 caracteres, `NODE_ENV=production`. `PORT` para execução local/host que exija. Para recuperação: `SMTP_HOST`, `SMTP_PORT` (465/587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. `TRUST_PROXY` somente com IPs/CIDRs confiáveis fora da Vercel. Alternativa Mongo: `DATABASE_BACKEND=mongo` e `MONGODB_URI`. `MONGODB_TEST_URI` somente para testes externos descartáveis.

Nunca expor JWT_SECRET ou service role em HTML, public/, logs ou variáveis de frontend. Segregar Preview e Production.

## Procedimento de liberação

1. Revisar o SQL, fazer backup restaurável e selecionar ambiente de homologação separado. Instalar com Node 24.15+ compatível e `npm ci`.
2. Banco novo: aplicar `supabase/schema.sql` e depois `supabase/migrations/20261030_appointment_requests.sql`. Banco existente desta aplicação: aplicar apenas a migração incremental, após conferir compatibilidade da baseline. Não executar importação Mongo para instalar este recurso.
3. Conferir grants/RLS e schema cache; verificar acesso direto de anon/authenticated negado e leitura/gravação via servidor. A migração foi testada para reaplicação sem apagar solicitações.
4. Configurar variáveis no ambiente isolado. Executar `npm run check`, `npm test`, `npm audit --omit=dev --audit-level=moderate` e iniciar `npm start`.
5. Testar com duas contas: cadastro, login, perfil, solicitação, recarga da página, edição, conflito de versão, cancelamento, filtros e isolamento. Testar entrega SMTP com destinatário autorizado, reset e logout. Não usar dados de clientes como massa de teste.
6. Usar a configuração Vercel existente (`vercel.json`, Express/Node 24, sem diretório de saída ou build customizado). Conferir `/api/health`, rotas profundas, cookies e assets no Preview. Esta entrega não criou deployment.
7. Confirmar processo de atendimento da equipe e documentos comerciais, depois obter autorização explícita para publicação. Aplicar a migração no destino autorizado antes de promover o código. Em rollback de código, preservar a tabela; não excluir registros novos.
8. Configurar monitoramento de 5xx/latência, backups, responsável por incidentes e política real de retenção de solicitações e dados pessoais.

## Pendências para operação comercial completa

- Agenda confirmada: definir horários, capacidade/máquinas, serviços, duração, indisponibilidades e fluxo da equipe. Criar área administrativa com autorização e trilha de auditoria antes de permitir confirmação.
- Catálogo administrável de serviços e preços. Hoje informações comerciais são estáticas e precisam de validação do negócio.
- Pagamentos/planos/recargas: escolher provedor e regras, implementar confirmação por webhook autenticado e conciliação; não há saldo nem crédito fictício.
- Fidelidade e cupons: regras, histórico real de serviços concluídos e permissões de lançamento.
- Contato comercial, horários, termos e privacidade reais, política de retenção/exclusão e procedimento de alteração de e-mail.
- Validar serviços hospedados após aplicação autorizada da migração; SMTP está configurado, mas entrega real não foi testada.
