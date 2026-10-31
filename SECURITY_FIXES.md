# Correções de segurança — LaveMais

> Atualização posterior: MFA TOTP, senhas novas de 12 caracteres, políticas de privacidade/cookies e preparação operacional foram adicionados após esta auditoria. Estado de ativação e pré-requisitos em `SEGURANCA-OPERACIONAL.md`; os achados abaixo registram o escopo anterior.

## Aplicadas nesta auditoria

| Correção | Arquivos | Validação |
| --- | --- | --- |
| AUD-01: redigir senha/token/chaves em mensagens JSON | src/safeError.js; src/safeError.test.js | Reprodução anterior com segredo sintético e regressão sem vazamento |
| AUD-02: neutralizar caracteres de controle e separadores de linha nos erros formatados | src/safeError.js; src/safeError.test.js | Teste com CRLF e U+2028 |
| AUD-03: comparar bcrypt também quando usuário não existe | src/passwordAuth.js; src/passwordAuth.test.js; src/routes/auth.js | Spy confirma comparação nos dois ramos; conta ausente nunca autentica |
| Rejeitar e-mail acima de 254 caracteres antes da regex em login/reset | src/authValidation.js; src/authValidation.test.js | Entrada sintética extensa recusada; reforço preventivo sem alegação de DoS medido |
| Ampliar provas de JWT e exposição de arquivos | src/supabase.integration.test.js; src/securityHeaders.test.js | Assinatura adulterada, expiração, HS384, issuer/audience errados retornam 401; fontes/arquivos privados retornam 404 |

Nenhuma dependência adicionada ou atualizada; nenhuma migração, segredo ou configuração de produção alterados. Layout, identidade visual, SMTP, cadastro, regras de agendamento, reset e expiração de sessão preservados. O primeiro login de conta inexistente calcula o hash de descarte uma vez; os seguintes reutilizam esse hash por processo. Não é garantia de resposta com tempo constante.

## Alterações anteriores preservadas no checkout

`.github/workflows/ci.yml`, `server.js`, `src/routes/staff.js`, `src/securityHeaders.test.js` e `SEGURANCA-GITGUARD.md` já continham as correções da revisão GitGuard: pins de Actions, permissões mínimas, destinos locais explícitos, UUID com tamanho limitado e classificação de erro sem regex aberta. Elas não foram revertidas nem atribuídas como descobertas novas. O teste de headers recebeu casos adicionais nesta auditoria.

## Pendências que precisam de decisão ou acesso operacional

- **AUD-04 (média, P2):** proposta de resposta uniforme de cadastro novo/existente. Não aplicada porque altera contrato 201/409 e experiência atual; definir confirmação/orientação de conta e atualizar frontend/testes juntos.
- Limite por conta no login, política de desbloqueio e proteção distribuída: discutir impacto em acesso legítimo antes de aplicar.
- Uniformização de reset com fila/outbox: discutir retentativas, entrega e estados de falha antes de mudar SMTP síncrono.
- Eventos e alertas estruturados de segurança; retenção e acesso aos logs; MFA da equipe e política de senha.
- Conferência de configuração real na Vercel, HTTPS, headers/cookies, confiança no proxy, grants/RLS implantados, backups e chaves. Nenhum acesso ou teste invasivo de produção realizado.
- Integração MongoDB dedicada, Semgrep/ESLint Security e secret scanner completo não executados. Nenhuma afirmação de auditoria completa da infraestrutura remota.

## Resultados

- Sintaxe: `npm run check` aprovado.
- Suíte completa: `npm test` — 43 aprovados, 0 falhas, 1 ignorado (MongoDB dedicado).
- Casos adicionais de JWT/arquivos privados: 3 testes direcionados aprovados após a suíte completa.
- `npm audit --json`: 0 vulnerabilidades conhecidas em produção e desenvolvimento. Lista de dependências vulneráveis vazia nesta consulta.
- Testes de rede local executados fora do sandbox para permitir conexões loopback. Auditoria npm consultou o registro fora da restrição de DNS. Sem dados reais de clientes ou envios SMTP reais.

O relatório técnico com evidências, riscos potenciais, limitações e propostas está em `SECURITY_AUDIT.md`. As alterações estão apenas no checkout local; não houve commit, push ou deploy. Reexecutar testes no CI antes de publicar.
