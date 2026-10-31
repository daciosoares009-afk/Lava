# Continuar com Google — LaveMais

O botão está disponível em login/cadastro. Integração OpenID Connect com fluxo de autorização no servidor, state, nonce e PKCE; sem scripts Google externos na página e sem nova dependência npm.

## Ativação

1. Aplicar `supabase/migrations/20261031_google_login.sql` no Supabase antes de habilitar OAuth. A migração adiciona identificador Google único e uma RPC de vínculo exclusiva do servidor; é reaplicável. MongoDB utiliza campo/index equivalente e não exige SQL (integração externa Mongo não executada).
2. No Google Cloud / Google Auth Platform, configurar nome/contato da aplicação, público e consentimento. Criar cliente OAuth do tipo **Aplicativo da Web**.
3. Cadastrar exatamente o URI de redirecionamento: `https://lava-sand.vercel.app/api/auth/google/callback`. Para teste local usar cliente de desenvolvimento com `http://localhost:3000/api/auth/google/callback`. Configurar cada Preview com URI/clientes próprios; não compartilhar banco/chaves de produção em Preview.
4. Na Vercel configurar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `APP_BASE_URL=https://lava-sand.vercel.app`, somente no servidor e no ambiente correto. O segredo não deve ser enviado no chat nem colocado em public/. Copiar o Client ID/secret do cliente criado, não de uma service account.
5. Publicar o código com novo deployment. Se a aplicação Google estiver em modo de teste, cadastrar usuários de teste autorizados. Revisar as exigências de publicação/verificação do Google para a audiência pretendida.
6. Validar primeiro em ambiente de teste: cancelamento do Google, retorno inválido, novo cadastro, vínculo com conta existente, acesso subsequente e MFA. Não basta visualizar o botão para considerar OAuth ativo.

## Comportamento

- Sem credenciais configuradas, o botão retorna à tela de login com orientação para usar e-mail/senha; não simula autenticação.
- O Google fornece identidade/e-mail/nome. Telefone e nascimento exigidos pela plataforma continuam sendo preenchidos pelo cliente. Senha local continua necessária para cadastro/recuperação atuais.
- Primeiro acesso: o Google confirma identidade; a tela preenche nome/e-mail. Quem já tem conta precisa confirmar a senha local (e MFA, se ativo) para vincular. Quem ainda não tem conta conclui o cadastro normal; o identificador Google é vinculado ao usuário criado apenas se o e-mail coincidir.
- Não há associação automática baseada somente em e-mail. A identidade é persistida pelo `sub` do Google; os acessos seguintes usam esse identificador, não nome ou foto.
- Usuários com MFA recebem desafio adicional. Google não substitui nem desativa o MFA da plataforma. O desafio não é enviado em URL nem armazenado em localStorage; cookies transitórios são HttpOnly e expiram em 5–10 minutos.
- Tokens Google são verificados por assinatura RSA/JWKS, issuer, audience, validade, nonce e e-mail verificado. Access/refresh tokens não são persistidos e não são solicitadas permissões de Drive/Gmail.
- O fluxo retorna para /conta após acesso direto. O usuário pode continuar usando login por senha. Não há interface de desvinculação nesta entrega.

## Validação

Teste integrado com PostgreSQL isolado, chaves RSA sintéticas e endpoints Google simulados: state inválido bloqueado antes da troca de código; PKCE verificado; vínculo somente após senha; assinatura/nonce/e-mail verificado; acesso subsequente e desafio MFA. Nenhuma conta Google real foi acessada e nenhum deploy foi realizado.

Referência oficial: https://developers.google.com/identity/openid-connect/openid-connect

Validação executada: `npm run check` aprovado; suíte completa com 55 testes (54 aprovados, zero falhas, um MongoDB externo ignorado). Após ajuste de retomada do retorno OAuth na interface, os oito testes de frontend passaram, incluindo preenchimento e mensagem após normalização da URL. Nenhum envio Google real nem deploy foi realizado.
