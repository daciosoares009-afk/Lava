# Revisão do relatório GitGuard

Relatório: cmvvrie4n05k6ctqpzr2kjdjm, commit analisado a107130745f9.

Os 14 apontamentos foram conferidos no código. Não foram encontradas credenciais reais nos trechos indicados.

| Apontamentos | Avaliação e tratamento |
| --- | --- |
| safeError.js:2 (1 HIGH) | Falso positivo: expressões de redação de credenciais nos logs, sem segredo embutido. Preservadas para evitar vazamento; cobertura em safeError.test.js. |
| server.js:39 (1 HIGH) | Falso positivo: UUID gerado pelo servidor, sem origem em entrada HTTP. A resposta agora usa diretamente uma variável local; teste envia ID controlado pelo cliente e verifica substituição. |
| server.js:113,132 (2 HIGH) | Já havia validação de destinos locais. Reforçada com mapa de rotas exatas que retorna valores do servidor; destino de retorno ao login também é reconstruído a partir das seções permitidas. Testes cobrem URLs externas, barras invertidas, CRLF, arrays e caminhos manipulados. |
| authValidation.js:21,31,51 (3 HIGH) | Falsos positivos: textos em português descrevendo requisitos de senha em errors.password. Não são senhas nem usadas como credenciais. Preservadas as mensagens e a validação. |
| ci.yml:7,8 (2 MEDIUM) | Actions fixadas por SHA completo verificado nas releases oficiais. Token limitado a contents: read e checkout sem persistência de credenciais. |
| staff.js:27,34 (2 MEDIUM) | Regex de UUID usa apenas quantificadores fixos, sem backtracking ilimitado. Adicionada checagem explícita de tipo e tamanho 36 antes da regex. |
| server.js:147 (1 MEDIUM) | Removido Mongo.* da classificação de erros. Comparações de strings limitadas a 128 caracteres evitam varreduras excessivas. |
| server.js:26,27 (2 LOW) | Proteções já presentes: x-powered-by desativado e CSP habilitada via Helmet. Verificadas por teste HTTP real; nenhuma proteção foi removida. |

Referências dos pins:
- https://github.com/actions/checkout/commit/34e114876b0b11c390a56381ad16ebd13914f8d5
- https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020

O scanner GitGuard não foi executado novamente neste ambiente. Falsos positivos podem continuar aparecendo e devem ser triados com as evidências acima, sem ocultar regras de análise.

## Validação executada

- npm run check: aprovado.
- npm test: 40 aprovados, zero falhas, 1 ignorado (MongoDB exige banco dedicado).
- npm audit --omit=dev --audit-level=moderate: zero vulnerabilidades.
- git diff --check: aprovado.

Testes HTTP e auditoria npm precisaram executar fora do sandbox devido ao bloqueio de conexões locais e de DNS no ambiente restrito.
