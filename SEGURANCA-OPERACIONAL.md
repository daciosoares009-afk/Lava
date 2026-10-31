# Segurança operacional, MFA e privacidade — LaveMais

## Estado real desta entrega

| Controle | Implementado no repositório | Ativação externa / limite |
| --- | --- | --- |
| SSL/HTTPS | HSTS explícito de um ano no Express; cookies Secure em produção; exemplo Nginx para hospedagem própria | Certificado é instalado/renovado na borda da hospedagem, não no JavaScript. Uma consulta HEAD passiva em 31/10/2026 confirmou HTTPS público, TLS 1.3, certificado aceito pelo Node e validade até 27/01/2027. Não foi instalado outro certificado. |
| Atualizações | Dependabot semanal para npm e GitHub Actions; CI existente testa e audita atualizações | Ativa ao publicar `.github/dependabot.yml` na branch padrão e habilitar Dependabot. Sem merge automático. A aplicação não usa CMS, temas ou plugins WordPress. Atualizar Node/plataforma via manutenção do provedor e revisão de engines/.nvmrc. |
| Backups isolados | Workflow diário 06:30 UTC (03:30 Brasília), exportação PostgreSQL public, criptografia AES-256-GCM, upload S3 com SSE-KMS e ferramenta de decriptação | **Não ativado**: requer conta isolada, bucket/KMS/IAM, CA do banco, segredos e variável BACKUPS_ENABLED. Nenhum banco real foi exportado, nenhum bucket foi criado, nenhuma restauração real foi feita. Backend configurado localmente é Supabase. |
| Senhas | Cadastro/reset exigem 12 caracteres com letra e número, limite bcrypt de 72 bytes; login aceita senhas antigas | Não altera hashes nem força redefinição de todos os usuários. Gerenciador de senhas e senhas únicas recomendados. |
| MFA/2FA | TOTP por aplicativo autenticador (6 dígitos/30 s); chave criptografada, ativação com senha e código, oito códigos de recuperação de uso único; limites por IP/conta | **Código pronto, não ativado em produção**. Requer migração e MFA_ENCRYPTION_KEY. Equipe pode ser obrigada a usar MFA com REQUIRE_STAFF_MFA=true. Não é ativado automaticamente na conta de nenhum usuário. |
| WAF e proxy | Vercel já fornece borda/proxy; modelo Nginx para outro host e procedimento de regras abaixo | WAF não foi reconfigurado: sem acesso autenticado à conta Vercel. Não se afirma que regras gerenciadas ou novas regras já estão ativas. |
| LGPD | Rotas /privacidade e /cookies; links na home, login, recuperação e conta; descrição dos dados e cookie reais | **Conformidade integral não atestada**. Falta identificação jurídica/CNPJ, canal digital oficial, fornecedores/transferências, retenção, descarte e procedimentos operacionais validados. |

## Ordem de liberação — pré-requisito obrigatório

1. Revisar as alterações e fazer backup restaurável do banco. Testar primeiro em Preview com banco separado. Nenhum deploy foi feito nesta sessão.
2. **Antes de publicar o novo código em Supabase**, executar `supabase/migrations/20261031_mfa.sql` após as migrações existentes. É aditiva/reaplicável. Novas sessões consultam `mfa_credentials`; a ausência da migração impede o banco de ficar pronto e bloqueia autenticação em vez de ignorar MFA.
3. Gerar **32 bytes aleatórios**, guardar no gerenciador de segredos e configurar `MFA_ENCRYPTION_KEY` como 64 caracteres hexadecimais no servidor. Exemplo local: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Esse comando exibe a chave: executá-lo somente em terminal privado. Não copiar a chave para commits, tickets ou logs.
4. Manter uma cópia da chave MFA em cofre isolado do banco. Perder a chave impede validar os segredos TOTP. Trocar a chave sem recifrar os registros bloqueia acessos. Planejar migração de chave e ensaio de recuperação, não trocar junto do JWT_SECRET por rotina.
5. Publicar em Preview, confirmar cadastro/login antigos e novos, ativação em /conta/perfil, login com código, recovery, desativação e isolamento de duas contas. Depois liberar pelo processo normal de produção.
6. Para equipe: cadastrar MFA nas contas autorizadas e só então definir `REQUIRE_STAFF_MFA=true` no servidor. A equipe sem MFA recebe 403 orientando ativação no perfil; clientes comuns continuam sem acesso à equipe. Ativar também MFA nas contas administrativas de Vercel, GitHub, Supabase e do armazenamento de backups, com recuperação guardada separadamente.

### Detalhes de MFA

- Configuração não emite sessão sem confirmar um código válido; expira em dez minutos. O segredo é adicionado manualmente no autenticador. Não há serviço externo de QR code nem envio da chave para terceiros.
- Login com senha de usuário inscrito retorna desafio JWT com audiência exclusiva e validade de cinco minutos; desafio não é cookie de sessão e não autentica /me. Frontend mantém o desafio apenas em memória.
- TOTP aceita janela de ±30 segundos. Um contador já consumido não é aceito novamente, inclusive em disputa concorrente. Ajustar relógio do servidor via sincronização do provedor.
- Códigos de recuperação têm 96 bits aleatórios cada, são armazenados somente por SHA-256 e exibidos uma única vez após ativação. São segundo fator: ainda é necessária senha no login.
- Ativar MFA invalida sessões anteriores sem a versão de MFA. Desativar exige senha + código e invalida outras sessões pelo sessionVersion; reset de senha **não remove MFA**.
- API limita tentativas por IP e por conta. Segredo em repouso usa AES-256-GCM com nonce aleatório e autenticação vinculada ao ID do usuário.
- MongoDB possui armazenamento equivalente, mas integração externa Mongo não foi executada. Não presumir validação de concorrência num cluster real com base no teste PostgreSQL.
- Sem autenticador e sem códigos, não há bypass automático por e-mail. Definir atendimento de recuperação com prova de identidade e trilha auditável antes de oferecer recuperação administrativa.

## Backups regulares e isolados

O workflow `.github/workflows/backups.yml` só executa quando a variável de repositório `BACKUPS_ENABLED` for `true`. Preparar no GitHub o ambiente `isolated-backups`, com restrição a branches confiáveis e controle de acesso; revisar como aprovações de ambiente impactam execuções agendadas. Não publicar artefatos do banco no GitHub Actions.

Configuração necessária:

| Nome | Local | Finalidade |
| --- | --- | --- |
| BACKUP_DATABASE_URL | Secret do ambiente | Conexão PostgreSQL direta ou pooler em modo session; usuário de backup com leitura das tabelas necessárias. Não usar transaction pooler. |
| BACKUP_CA_PEM | Secret do ambiente | CA confiável do banco; cliente usa verify-full. |
| BACKUP_ENCRYPTION_KEY | Secret + cofre de recuperação separado | 32 bytes aleatórios em hexadecimal; diferente da chave MFA. |
| BACKUP_AWS_ACCESS_KEY_ID / BACKUP_AWS_SECRET_ACCESS_KEY | Secrets do ambiente | Credencial dedicada de upload na conta isolada, escopo mínimo. Migrar a OIDC/credenciais curtas conforme política da organização. |
| BACKUP_S3_BUCKET / BACKUP_KMS_KEY_ID / BACKUP_AWS_REGION | Variables do ambiente | Destino S3 privado e chave KMS na conta isolada. |

Provisionar conta/projeto independente da aplicação; habilitar bloqueio de acesso público, versionamento e Object Lock com retenção padrão (ex.: 30 dias, a confirmar com política LGPD). A credencial de upload não deve poder excluir versões, alterar retenção, desligar proteção ou administrar o bucket. Dar apenas permissões de upload e KMS exigidas, sem leitura de backups pelo serviço da aplicação. Separar credencial de restauração e custódia das chaves.

`pg_dump` e AWS CLI devem estar disponíveis; o workflow usa cliente PostgreSQL do runner e AWS CLI do ambiente Ubuntu. Conferir que pg_dump é da mesma versão principal ou mais nova que o servidor; mudar o runner/instalação quando necessário. O dump inclui somente o schema public desta aplicação, sem ownership/ACL. Não inclui contas do provedor, objetos de Storage, configurações Vercel, segredos ou outros schemas. Complementar com backup da infraestrutura e das chaves em cofre; não são substituídos por este arquivo.

O stream do dump é criptografado antes de gravar o artefato temporário; não há dump em texto simples intermediário. Upload usa SSE-KMS adicional. Falhas encerram o job com erro e mensagem sem credenciais. Configurar notificações de falha no GitHub e alerta externo de ausência de backup bem-sucedido por mais de 26 horas; job pulado não constitui backup. Não foi criado monitor externo nesta sessão.

### Ensaio de restauração

1. Baixar uma cópia usando credencial de restauração e destino isolados. Configurar BACKUP_ENCRYPTION_KEY em terminal privado e executar `npm run backup:decrypt -- caminho.dump.enc restaurado.dump`. A ferramenta não sobrescreve arquivo existente nem restaura banco automaticamente. O arquivo local de saída contém dados pessoais: restringir acesso e eliminar após ensaio.
2. Validar com `pg_restore --list restaurado.dump`. Restaurar **somente em instância/projeto descartável dedicado**, nunca apontar comandos de teste ao banco principal. Conferir previamente host e banco de destino com dupla checagem operacional.
3. Reaplicar grants e políticas pelas migrações revisadas após restaurar estruturas/dados; no Supabase não sobrescrever schemas gerenciados. Conferir versões e a sequência de migrações apropriada ao dump. Testar login com contas sintéticas em staging e a integridade dos registros sem abrir dados reais a terceiros.
4. Registrar horário do backup, checksum do objeto, duração, integridade, resultado e responsável. Meta inicial proposta: RPO de 24 h; medir RTO em ensaio antes de prometer prazo. Exercitar mensalmente e depois de mudar banco/versão/formato/chaves.
5. Exclusões LGPD devem ser reaplicadas após recuperação para não reativar dados apagados. Definir retenção compatível com obrigações e um registro de exclusões em ambiente separado e protegido.

## HTTPS, WAF e proxy reverso

A Vercel gerencia certificados para domínios configurados. Confirmar domínio/DNS, renovação e alertas no painel; não adicionar servidor TLS dentro da função Express. A verificação passiva desta sessão encontrou certificado válido e HSTS na borda. O HSTS da aplicação não força inclusão de subdomínios que podem pertencer a outros sistemas; a borda tem política própria. Não foi auditado o redirecionamento de todos os domínios/aliases.

No painel do projeto Vercel > Firewall:

1. Conferir proteções básicas e disponibilidade de regras gerenciadas no plano atual. Habilitar regras adequadas em modo de observação quando disponível, observar falsos positivos e depois aplicar bloqueio. Não presumir que funcionalidades pagas estão incluídas.
2. Criar regra limitada a POST de /api/auth/login, /api/auth/register e recuperação/MFA, com orçamento compatível com clientes compartilhando IP. Usar rate limit na borda quando disponível; manter limites persistentes do backend. Não fixar países/IPs arbitrários que excluam clientes.
3. Criar proteções de rotas sensíveis e detecção de tráfego anormal conforme logs. Preferir 429/bloqueio para API a desafios HTML que quebram fetch, SMTP callbacks ou clientes legítimos. Validar em Preview/canário antes de produção.
4. Configurar alertas, revisar logs sem corpos/senhas e registrar exceções com prazo. Limitar acesso ao painel, exigir MFA e manter trilha de mudanças. Não adicionar proxy Cloudflare sem necessidade: uma segunda borda muda IP, cache, TLS e regras de confiança.

Para hospedagem própria, `infra/nginx.conf.example` é um **modelo não carregado**: substituir domínio/caminhos, emitir certificado ACME com o provedor escolhido, testar `nginx -t` e renovar automaticamente. Bloquear acesso externo à porta 3000 no firewall ou bind em loopback, permitindo somente o proxy. Configurar TRUST_PROXY com IP/CIDR real (ex.: 127.0.0.1/32), nunca `true`. O exemplo Nginx não instala módulo WAF: utilizar serviço WAF contratado ou ModSecurity/OWASP CRS testado antes de declarar proteção ativa.

## LGPD: documentos e operação

Páginas públicas: /privacidade e /cookies. O aviso do site descreve o cookie de sessão de até sete dias e não inclui banner de consentimento para analytics/publicidade, que não existem no código revisado. Fontes Google externas continuam existentes e são informadas; avaliar auto-hospedagem para reduzir transferência de IP. Cookies ou telemetria adicionados pela hospedagem devem ser inventariados no ambiente real.

As páginas usam a marca/endereço da unidade já presentes no projeto e não inventam CNPJ, encarregado, e-mail ou telefone. O usuário ainda não forneceu os dados solicitados. **Antes de considerar a política definitiva**, confirmar razão social/CNPJ e canal de direitos, fornecedores/suboperadores e países, mecanismos de transferência, prazo e base legal por finalidade, registro de legítimo interesse quando aplicável, tratamento de menores, retenção e resposta a incidentes. Revisar necessidade da coleta de nascimento e histórico; minimizar os dados se não houver finalidade documentada.

Estabelecer procedimento para confirmação de tratamento/acesso/correção/eliminação e resposta nos prazos aplicáveis, validação proporcional da identidade, registro de solicitações, contratos com operadores e avaliação de incidentes. Não foi implementado apagamento automático: pode haver obrigação de retenção e integridade de histórico; definir o processo antes de excluir registros. Não coletar consentimento genérico obrigatório como substituto de base legal. A existência destas páginas não certifica conformidade integral com a LGPD.

## Fontes oficiais consultadas

- [Vercel SSL](https://vercel.com/docs/domains/working-with-ssl)
- [Vercel Firewall](https://vercel.com/docs/vercel-firewall)
- [Supabase Backups](https://supabase.com/docs/guides/platform/backups)
- [GitHub Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [RFC 6238 TOTP](https://www.rfc-editor.org/rfc/rfc6238)
- [ANPD — cookies e proteção de dados](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf)

A decisão final sobre bases legais, responsabilidades e retenção depende da operação real e de revisão jurídica. Este documento distingue código pronto de serviços efetivamente ativados.

## Validação desta etapa

- `npm run check`: aprovado; `git diff --check`: sem erros.
- Suíte completa: 54 testes, 53 aprovados, zero falhas, 1 ignorado (MongoDB dedicado).
- Após o ajuste final da exigência de MFA na equipe: 5 testes direcionados de MFA, equipe e API Supabase aprovados.
- TOTP conferido com os seis vetores SHA1 da RFC 6238; criptografia vincula o segredo ao usuário e recusa chave incorreta.
- Backup: cifra/decripta uma fixture sintética, recusa adulteração e não sobrescreve destino existente. Não substitui ensaio de pg_dump/upload/restauração reais.
- `npm audit --json`: zero vulnerabilidades conhecidas; nenhuma dependência nova.
- HEAD passivo em HTTPS público: 200, TLSv1.3, cadeia aceita, certificado válido até 27/01/2027 e HSTS presente. Não houve mudança de DNS/certificado nem ataque em produção.
- Políticas e HSTS testados por HTTP local. A captura simples do Chrome impôs viewport mínimo; não é evidência conclusiva de revisão visual a 390 px. A interface MFA tem regressão DOM e API; teste manual com autenticadores reais em Preview ainda é necessário antes de produção.

O usuário de backup deve conseguir ler todo o escopo public apesar de RLS (papel dedicado com grants de leitura e autorização de bypass apropriada, validado pelo administrador). Não criar política pública para viabilizar backup e não aceitar dump parcial como sucesso. Verificar contagens/integridade na restauração isolada.
