# Auditoria inicial — 30/10/2026

Estado observado antes das alterações desta etapa. Repositório inicialmente sem alterações locais rastreadas.

## Arquitetura

Node 24, Express 5, HTML/CSS/JavaScript sem bundler. Autenticação própria com bcrypt, JWT em cookie HttpOnly, revogação persistida e versão de sessão. Camada de repositório com seleção explícita MongoDB/Mongoose ou Supabase/PostgREST. Supabase Auth não é utilizado. Chave de serviço restrita ao servidor; tabelas privadas com RLS e grants fechados. Hospedagem Express/Vercel e CI existentes.

## Fluxos e lacunas

- Implementados no código: cadastro, login, logout, recuperação por SMTP, perfil próprio, limites persistidos e health do banco. Validação externa de banco/SMTP ainda necessária; presença de configuração não comprova operação.
- Agendamentos: apenas estado vazio, sem tabela, API ou persistência.
- Serviços, preços, recargas e informações comerciais: arquivo estático `public/site-content.js`; não há catálogo administrável. Valores existentes não comprovam condições comerciais vigentes.
- Planos, pagamentos, créditos, cupons e fidelidade: explicitamente indisponíveis, sem integração. Nenhum pagamento ou benefício real deve ser inferido da interface.
- WhatsApp, telefone, horários, termos e privacidade incompletos. Não inventar contatos, preços, políticas ou horários.
- Mocks encontrados em testes (PostgREST, SMTP e DOM), isolados da operação. Sem fallback de banco para dados fictícios.

## Segurança e operação

- Problema concreto: `persistentLimit` usava `req.ip` diretamente, ignorando a normalização IPv6 e identidade Vercel já implementadas em `clientIdentity`.
- Cookie SameSite Strict e JSON restringem CSRF; adicionar bloqueio explícito de requisições de escrita identificadas como cross-site pelo navegador.
- A chave service role ignora RLS: todas as novas consultas devem obrigatoriamente restringir proprietário no servidor; nunca aceitar proprietário ou status do cliente.
- Não há fluxo administrativo para atendimento, confirmação de reservas ou gestão comercial. Faltam capacidade, máquinas, calendário e responsáveis para uma agenda com disponibilidade garantida.
- Teste inicial: 21 passaram, 1 ignorado e 5 falharam por EACCES na conexão HTTP local do ambiente restrito. Reexecutar com acesso a loopback antes de concluir.

## Prioridade desta entrega

Implementar solicitações de atendimento persistidas, editáveis e canceláveis pelo proprietário, com histórico e filtros; sem alegar confirmação automática ou notificação da equipe. Preservar os componentes e design existentes. Preparar migração aditiva revisável, sem executar em banco externo, apagar dados ou publicar. Testar SQL, permissões, isolamento entre contas, validação e integração HTTP/UI. Documentar pendências para a liberação real.
