# SECURITY AUDIT — LaveMais

> Atualização posterior: MFA TOTP, senhas novas de 12 caracteres, políticas de privacidade/cookies e preparação operacional foram adicionados após esta auditoria. Estado de ativação e pré-requisitos em `SEGURANCA-OPERACIONAL.md`; os achados abaixo registram o escopo anterior.

Data: 31/10/2026 UTC (30/10 no horário local no início da sessão). Base: commit `a107130`; inclui alterações locais de segurança anteriores a esta auditoria. Escopo: código versionado, configuração, dependências instaladas/lockfile, frontend, backend, SQL e testes locais. Não houve deploy nem acesso ao banco de produção.

## Conclusão

Não foram confirmadas vulnerabilidades críticas ou altas no escopo exercitado. Foram identificadas lacunas na redação de logs, separação temporal no login e enumeração explícita no cadastro. As correções de baixo risco estão aplicadas localmente. Há pendências de desenho e verificações operacionais. Isso não certifica a segurança integral da aplicação.

A auditoria começou pelo mapeamento do repositório, antes dos testes. A tentativa de leitura da página pública pela ferramenta de navegação não retornou conteúdo. Não foram realizados fuzzing, login, cadastro, exploração ou escrita contra produção; headers, configurações e permissões efetivas da implantação continuam sem verificação.

## Arquitetura e fronteiras de confiança

- Node v24.15.0; npm 11.12.1; Express 5. Backend modular em `server.js` e `src/routes`. HTML/CSS/JS estáticos; somente `public/` é servido como diretório. Páginas privadas passam por sessão; HTML do dashboard não é exposto diretamente.
- MongoDB/Mongoose e Supabase/PostgREST são alternativas, selecionadas por `src/config.js`; presença de ambas exige escolha explícita. Não se presumiu qual banco está em produção.
- Supabase usa chave `service_role` exclusivamente no servidor; a autenticação é própria, não Supabase Auth. RLS e revogações SQL bloqueiam `anon`/`authenticated`, mas **não substituem a autorização no servidor privilegiado**. Filtros `user_id` e atribuição de equipe por UUID são fronteiras essenciais.
- JWT HS256, issuer/audience fixos, jti aleatório, expiração de sete dias. Cookie `lavemais_session`: HttpOnly, SameSite=Strict, Path=/; Secure em produção/Vercel. Revogação persistente por hash no logout e versão de sessão incrementada no reset.
- Senhas bcrypt custo 12; validação de tamanho máximo de 72 bytes. Reset por código aleatório de seis dígitos, HMAC-SHA256, dez minutos, uso único atômico e cooldown. SMTP via Nodemailer com TLS; não foi encontrada integração Resend no código de envio.
- Rate limits persistentes em ambos os backends, janelas fixas; falha do armazenamento não libera a operação. Express limita JSON a 16 KB. Vercel tem inicialização preguiçosa de banco e timeout configurado de 30 segundos.
- Frontend usa fetch same-origin e renderização de dados pessoais via textContent/criação de elementos; o innerHTML em app.js contém somente textos literais do próprio código. Não há uso de localStorage/sessionStorage para sessão nos arquivos revisados.

### Superfície de rotas

| Grupo | Acesso e controles principais |
| --- | --- |
| GET /, /login, /recuperar-senha; public/ | Público; sem conteúdo de cliente embutido; CSP/Helmet |
| GET /conta[/seção] | Sessão válida ou redirecionamento local; seções permitidas explícitas |
| GET /equipe | Sessão + UUID em STAFF_USER_IDS |
| POST /api/auth/register, /login | Público, validação, banco disponível, limite compartilhado por IP (10/15 min) |
| POST /api/auth/password-reset/request | Público, limite por IP 5/h e cooldown no banco |
| POST /api/auth/password-reset/confirm | Público, limite por IP 10/15 min e por e-mail 10/h; reset atômico |
| GET /api/auth/me | JWT + revogação + versão de sessão + usuário existente |
| POST /api/auth/logout | Limpa cookie, verifica token e persiste revogação; sem cookie retorna 204 |
| GET/PATCH /api/client/profile | Sessão; ID exclusivamente da sessão; somente nome/telefone/nascimento editáveis |
| /api/client/appointments | Sessão; propriedade por user_id, revisão otimista, campos permitidos, limite de escrita 60/h por IP |
| /api/staff/appointments e transições/notify | Sessão + equipe; limite de escrita 120/h por IP; estados/revisão validados; histórico e lease de notificação |
| GET /api/health | Público; somente prontidão/status, sem credenciais |

## Achados confirmados

Severidades são qualitativas e consideram os controles existentes; não representam CVSS calculado. P1: próxima entrega; P2: correção planejada; P3: manutenção.

| ID / vulnerabilidade | Severidade | Arquivo/rota | Impacto | Correção / prioridade |
| --- | --- | --- | --- | --- |
| AUD-01 — Redação não cobria chaves JSON entre aspas | Média | src/safeError.js, logs de erros do servidor | Segredo em mensagem de erro nesse formato poderia chegar ao agregador de logs | Corrigido: chaves JSON reconhecidas; P1 |
| AUD-02 — Quebras de linha em mensagens de erro | Baixa | src/safeError.js | Entradas multilinha poderiam confundir trilha operacional ou forjar linhas | Corrigido: caracteres de controle/separadores de linha neutralizados; P2 |
| AUD-03 — Conta inexistente pulava bcrypt | Baixa | POST /api/auth/login | Diferença de trabalho permite inferir existência por tempo; cadastro já oferece outro oráculo | Corrigido: comparação com hash de descarte custo 12; P2 |
| AUD-04 — Cadastro revela e-mail já registrado | Média | src/routes/auth.js, POST /api/auth/register | 201 versus 409/EMAIL_IN_USE permite enumeração de contas, mitigada apenas por limite de IP | Pendente de decisão de produto; P2 |

### AUD-01: evidência e limite

O código anterior procurava `password:`/`password=`, mas não o fechamento de aspas de `"password":`. Reprodução local contra `git show HEAD:src/safeError.js`, usando somente uma credencial sintética, retornou `baselineLeaksSyntheticJsonPassword: true`. Após a correção, o teste confirma remoção de password/token/api_key em JSON e preservação das mensagens úteis. Não foi constatado vazamento de uma credencial real em logs de produção. O impacto pressupõe mensagem de erro contendo segredo nesse formato; o filtro continua sendo defesa adicional, não justificativa para registrar corpos HTTP, cookies ou cabeçalhos de autenticação.

### AUD-02: evidência e limite

A mesma reprodução retornou `baselineAllowsMultiline: true` com CRLF sintético. A correção neutraliza C0, DEL e separadores Unicode de linha em nome/código/mensagem formatados. Outros campos e outros emissores de logs não passam automaticamente por esse filtro; revisar futuras instrumentações. Nenhuma injeção contra logs remotos foi tentada.

### AUD-03: evidência e limite

Antes: `user ? await bcrypt.compare(...) : false`; somente contas existentes executavam a comparação cara. Agora `src/passwordAuth.js` compara em ambos os casos e exige usuário existente para autorizar. Hash de descarte aleatório, custo 12, reutilizado por processo e nunca usado como credencial. Teste com spy comprova comparação nos dois ramos e rejeição do usuário ausente mesmo se compare retornar true. Não se afirma tempo constante da resposta: consultas, rede, cache e a primeira geração do hash ainda afetam latência. Nenhum benchmark remoto de enumeração foi feito.

### AUD-04: proposta antes de mudança incompatível

A suíte local reproduz cadastro existente com 409. A mensagem do frontend depende desse contrato, por isso não foi alterado silenciosamente. Proposta: resposta genérica e consistente para cadastro novo/existente, após decidir como orientar o usuário legítimo por canal verificado e evitar diferenças temporais. Exige revisão de UX, contrato da API e testes; não basta trocar o texto mantendo códigos distinguíveis.

## Riscos potenciais e melhorias propostas

Estes itens não constituem exploração confirmada em produção.

| Item | Prioridade | Evidência / proposta |
| --- | --- | --- |
| Ataques distribuídos contra login | P2 | Login limita IP, não a conta. Bots com vários IPs poderiam contornar o orçamento individual. Propor limite por conta + IP com política de desbloqueio e detecção de abuso; não impor bloqueio novo sem discutir negação de acesso a clientes/NAT. |
| Enumeração temporal/por falha no pedido de reset | P2 | Conta existente faz SMTP; ausente/cooldown não. Falha SMTP gera 503 apenas no ramo de envio. Potencial de inferência, sem teste remoto. Fila/outbox e resposta uniforme exigem mudança de entrega/retentativas e devem ser planejadas. |
| Telemetria de autenticação insuficiente no código | P2 | Há logs de erros, mas nenhum evento estruturado dedicado de login recusado, limite excedido ou revogação. Planejar eventos sem senha/token, retenção, acesso e alertas; monitoramento externo não foi inspecionado. |
| CSRF em ambientes com subdomínios não confiáveis | P2 | SameSite=Strict, JSON e rejeição de Sec-Fetch-Site=cross-site protegem fluxos usuais; same-site não é same-origin. Validar propriedade dos subdomínios e clientes antes de introduzir allowlist Origin/Referer e rejeição de simple content types. Não foi confirmada exploração. |
| Privilégio da chave service_role | P1 operacional | Um comprometimento do servidor contorna RLS. Restringir chave ao backend, separar ambientes, revisar grants e rotacionar se houver evidência de exposição. Não há exposição comprovada nesta auditoria. |
| Senhas mínimas de 8 caracteres e ausência de MFA | P2 de produto | Política atual não foi alterada para não bloquear usuários/fluxos. Discutir comprimento maior e senha comprometida, MFA especialmente para equipe. Não equivalem a comprometimento confirmado. |
| Crescimento de histórico e custo de banco | P3 | Histórico JSON da equipe sem limite de volume total; leituras por página da equipe fazem consultas de clientes por registro; limpeza de rate limits ocorre no caminho de requisições SQL. Medir com carga sintética em staging antes de ajustar armazenamento/retentativas. |

## Cobertura por categoria OWASP

| Categoria | Resultado no escopo local |
| --- | --- |
| Broken Access Control / IDOR | Filtros de proprietário em lista/edição/cancelamento; cliente comum recebe 403 na equipe. Testes usam outro usuário sintético e recusam alteração. RLS/grants/RPCs conferidos em PostgreSQL local. Sem acesso aos grants efetivos de produção. |
| Security Misconfiguration | Helmet/CSP, ausência de X-Powered-By e arquivos privados não servidos verificados por HTTP local. Sem CORS permissivo configurado. Flags de produção testadas em cold start simulado. TLS/edge/CDN/domínios reais não verificados. |
| Software Supply Chain Failures | npm audit completo: zero advisories conhecidos. Lockfile e npm ci; Actions por SHA completo, contents:read e checkout sem credenciais persistentes. Não é verificação de integridade de todos os pacotes nem detecção de malware. |
| Cryptographic Failures | bcrypt custo 12, JWT HS256 restrito, HMAC de reset e hash de revogação. JWT_SECRET exige ao menos 32 caracteres e rejeita placeholders conhecidos, mas isso não prova entropia. TLS Mongo depende da URI/configuração; não certificado remotamente. |
| Injection SQL/NoSQL/comandos | Entradas mapeadas por lista permitida; e-mail normalizado para string; consultas Supabase tipadas e RPC SQL sem SQL dinâmico observado; Mongoose não recebe objeto de e-mail do cliente. Spawns encontrados são de ferramentas locais com argumentos definidos, não endpoints. Sem injeção confirmada. |
| Insecure Design | AUD-04 e riscos de abuso distribuído/reset. Estado de atendimento/revisão e notificações com lease/limite de tentativas cobertos localmente. |
| Authentication Failures | AUD-03 corrigido; tokens adulterados/expirados, issuer/audience/algoritmo diferentes rejeitados; logout e reset invalidam sessões nos testes. Sem validação de MFA ou entropia de segredos reais. |
| Software/Data Integrity Failures | Migrações reaplicáveis testadas; revisão otimista bloqueia escritas concorrentes; actions pinadas. Pipeline implantado e controle de aprovação/branches não foram inspecionados. |
| Security Logging and Alerting Failures | AUD-01/02 corrigidos. Alertas e retenção reais não verificados; eventos de autenticação dedicados são melhoria proposta. |
| Exceptional Conditions | JSON inválido 400, payload excessivo 413, banco indisponível 503, fallback de erros sem stack ao cliente; falha SMTP/limpeza e inicialização concorrente cobertas. Não foram simuladas todas as falhas de infraestrutura. |
| XSS / SSRF / CSRF | Conteúdo dinâmico renderizado como texto; templates escapam HTML; CSP sem unsafe-inline/script. Destinos externos de banco/SMTP são configuração de operador, não URL livre de requisição. Não foi identificado endpoint de fetch arbitrário. CSRF tem defesas e limite same-site descrito acima. |

## Segredos, ambiente e dependências

- 75 arquivos versionados inventariados. `.env` está ignorado e não é versionado; nenhum commit de `.env` foi encontrado nas referências locais acessíveis. Isso não inspeciona objetos removidos, forks, caches ou histórico remoto completo.
- Comparação local, sem exibir valores: nenhum dos valores sensíveis atuais de `.env` com ao menos 16 caracteres foi encontrado literalmente nos arquivos versionados de até 1 MB. Inspeção das fontes não identificou credencial operacional no frontend; fixtures de teste e mensagens de senha não foram tratadas como segredos reais. Não é secret scanning completo com detecção de todas as codificações.
- Nenhum valor de `.env` foi incluído neste relatório. Não foi afirmada validade, força aleatória, rotação ou ausência de vazamento externo das chaves.
- `npm audit --json`: **0 vulnerabilidades**, incluindo produção e desenvolvimento; 112 entradas prod e 39 dev informadas pelo npm, total 150 (contagens de categorias não precisam somar). Relação de dependências vulneráveis: **vazia nesta consulta**. Sem upgrades necessários por advisory encontrado.
- Semgrep e ESLint Security não foram encontrados disponíveis/configurados no ambiente. Não foram instalados. Realizada revisão manual e testes, sem alegar execução desses scanners ou novo scan GitGuard.

## Verificações executadas

- `npm run check`: aprovado (sintaxe JavaScript; não é lint semântico).
- `npm test`: 44 testes, 43 aprovados, zero falhas, um ignorado por depender de MongoDB dedicado.
- Após ampliar casos de JWT/arquivos privados: `node --test src/supabase.integration.test.js src/securityHeaders.test.js`: três testes aprovados.
- Testes novos de passwordMatches, redação e limite de e-mail: 11 aprovados no grupo direcionado (inclui testes preexistentes).
- Testes usam PostgreSQL/PGlite isolado, transporte PostgREST e SMTP simulados, contas sintéticas e servidor em loopback. Não enviam e-mails reais. Testes MongoDB não foram executados contra banco externo.
- Reprodução do redator original confirmou as duas lacunas com segredo sintético. Testes de regressão cobrem o comportamento corrigido.
- HTTP local confirma 404 para `.env`, `.git/config`, `server.js`, `src/config.js` e `dashboard.html`; sem Access-Control-Allow-Origin permissivo; CSP presente; X-Request-ID gerado pelo servidor.

## Antes de produção

1. Revisar e publicar as correções deste checkout pelo processo normal, com rollback. Nada foi implantado nesta sessão.
2. Conferir variáveis por ambiente sem expô-las: segredo JWT aleatório forte, chave service_role apenas server-side, SMTP com TLS, APP_BASE_URL oficial, STAFF_USER_IDS mínimos e TRUST_PROXY limitado. Rotação de JWT invalida sessões e códigos de reset; planejar janela.
3. Conferir no ambiente real as migrações/grants/RLS/RPCs e backups com restauração testada, usando acesso administrativo autorizado separado. O SQL local não prova estado implantado.
4. Decidir AUD-04 e políticas de limitação por conta, MFA e enumeração de reset antes de alterar contratos.
5. Configurar proteção de borda/WAF, orçamento de abuso, alertas e retenção/restrição de logs. Confirmar tratamento de IP e cabeçalhos sobrescritos pela Vercel para impedir spoofing de limites.
6. Validar HTTPS/HSTS/CSP/cookies na implantação com consulta passiva; revisar dependências continuamente, proteção de branches e permissões do CI. Executar SAST e secret scanning no pipeline quando disponibilizados.
7. Executar integração MongoDB em banco descartável dedicado se esse backend for usado; testar staging com volume sintético antes de prometer resistência a DoS.

Referências de orientação (as conclusões acima derivam do código e dos testes locais): [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
