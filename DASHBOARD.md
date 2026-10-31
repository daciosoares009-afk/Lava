# Dashboard LaveMais

## Implementação local

- `dashboard.html`: nova hierarquia da página inicial, resumos, próximo atendimento, fidelidade, histórico, planos e atendimento compacto; entrada Histórico no menu; acesso às atualizações pelo ícone de notificações.
- `public/dashboard.css`: cards, estados de status, skeleton, foco, movimento reduzido e organização responsiva; cores e logo oficiais preservadas.
- `public/dashboard.js`: resumo autenticado, detalhes seguros inseridos como texto, cancelamento com confirmação e revisão, atualização após alterações, falhas com nova tentativa e ícones SVG sem dependências adicionais.
- `src/appointments.js`: consultas por proprietário para contagem futura, próximo atendimento e cinco registros recentes, em Supabase e MongoDB.
- `src/routes/client.js`: GET `/api/client/dashboard`, protegido pelo middleware de sessão existente. O proprietário vem da sessão, nunca dos parâmetros enviados pelo navegador.
- `server.js`: inclusão de `/conta/historico` nas rotas protegidas. As demais alterações de segurança que já existiam no workspace foram preservadas.
- `src/frontend.test.js`: teste do resumo, detalhes sem injeção HTML, cancelamento, estado vazio e recuperação de falhas.
- `src/supabase.integration.test.js`: verificações de sessão, privacidade do resumo, contagem após cancelamento e rota de histórico.
- `test-support/postgres.js`: suporte aos filtros e à contagem HEAD usados pelo novo resumo no banco temporário dos testes.

## Dados e regras preservados

O sistema armazena solicitações com serviço, data de preferência, observações, status e revisão. Futuras são as solicitações pendentes ou confirmadas com data igual ou posterior ao dia atual no fuso America/Sao_Paulo. Somente pendentes podem ser canceladas pelo cliente, conforme a regra existente.

O histórico inicial mostra os cinco registros mais recentes de todos os status. O acesso ao histórico completo reutiliza a listagem paginada e seus filtros em Agendamentos.

Não há campos estruturados de horário, preço, pagamento, assinatura individual nem regras de elegibilidade/meta/recompensa. Esses dados são apresentados como indisponíveis. A barra de fidelidade é uma trilha inativa, sem percentual ou pontos atribuídos. Não foi criada contagem de recompensa, saldo financeiro ou assinatura fictícia. A seção de planos usa somente condições comerciais publicadas; o WhatsApp depende do contato configurado em `public/site-content.js`.

## Validação

- `npm run check`: aprovado.
- `npm test`: 44 aprovados, 0 falhas, 1 ignorado (integração MongoDB exige instância dedicada).
- Testes de APIs executados em banco PostgreSQL temporário via PGlite, sem acesso a produção.
- Revisão visual em navegador ainda pendente; os testes de interface usam JSDOM e não validam a renderização visual.
- Nenhum deploy, migração ou alteração de dados em produção foi executado.

## Dependências para evolução

Cadastrar o canal comercial e seus horários; definir e persistir regras de fidelidade; implementar registros de pagamentos e preços por atendimento; implementar assinaturas e benefícios individuais; adicionar horário estruturado se a operação passar a utilizá-lo. Essas integrações devem incluir validação e autorização no servidor antes de habilitar métricas e ações correspondentes na interface.
