# LaveMais — experiência pública e área do cliente

Aplicação Node.js/Express que serve as telas existentes e armazena contas no MongoDB Atlas por Mongoose. O servidor não inicia sem `MONGODB_URI` e `JWT_SECRET` válidos.

## Página pública

- `GET /` e `GET /index.html` exibem a página inicial pública da LaveMais.
- `GET /login` exibe a tela existente de login e cadastro; `GET /cadastro` abre o modo de cadastro.
- Em `/recuperar-senha`, o cliente pode pedir um código de 6 dígitos enviado ao e-mail cadastrado. O código expira em 10 minutos, só pode ser usado uma vez e a redefinição invalida as sessões anteriores. O envio exige configuração SMTP; sem ela, login e demais funções continuam disponíveis e a tela informa que o envio está indisponível.
- Após login, o cliente segue para `GET /conta` ou volta ao destino privado solicitado antes da autenticação. As páginas internas possuem endereços próprios: `/conta/inicio`, `/conta/agendamentos`, `/conta/servicos`, `/conta/planos`, `/conta/beneficios`, `/conta/perfil` e `/conta/sobre`. Todas exigem a sessão existente. O logout volta para o login.
- Em telas pequenas, o menu lateral abre por um botão acessível e apresenta todas as páginas; a navegação inferior mantém os atalhos principais.
- No dashboard, o cliente pode consultar e editar nome, telefone e data de nascimento por `GET/PATCH /api/client/profile`. O e-mail é somente leitura. A API identifica o cliente pelo cookie autenticado e nunca recebe um ID de cliente indicado pelo navegador.
- `GET /api/client/profile` e `PATCH /api/client/profile` exigem sessão válida. A sessão usa o cookie HttpOnly existente, com SameSite Strict; o caminho agora abrange também `/conta` para que o servidor possa proteger a página.
- O dashboard exibe os dados comerciais de `site-content.js` somente quando preenchidos. Agendamentos, contratação de planos, pagamentos, fidelidade e cupons ainda não possuem armazenamento ou integração; aparecem como indisponíveis, sem dados de demonstração. WhatsApp só aparece com um número comercial válido configurado. Abrir a conversa não confirma um agendamento.
- Edite somente `site-content.js` para inserir informações comerciais confirmadas: número do WhatsApp em formato internacional apenas com dígitos, telefone, endereço, horários, URL do Maps, serviços, preços, história e links legais. Quando esses dados estiverem vazios, a home informa sua disponibilidade sem inventar conteúdo; a ação de WhatsApp só aparece com um número válido.
- A logo usada na home é o arquivo original `logo-lavemais.png`; `lavemais-hero.jpg` é uma imagem ilustrativa de Chris Weiher, publicada no Unsplash sob a licença Unsplash. `home.css` e `home.js` são isolados dos estilos e scripts da autenticação.

## Configuração local

Requer Node.js 20 ou superior.

1. No MongoDB Atlas, crie uma conta/projeto e um cluster. Crie um usuário de banco de dados e permita o acesso de rede a partir do seu IP atual.
2. Copie a URI do cluster em **Connect → Drivers**. Use o banco `lavemais` no caminho da URI, substitua usuário/senha e codifique caracteres especiais da senha para URL.
3. Copie `.env.example` para `.env` e preencha `MONGODB_URI`.
4. Gere `JWT_SECRET` localmente com `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` e coloque o resultado no `.env`. Não compartilhe nem envie esse arquivo ao GitHub.
5. Para habilitar a redefinição de senha, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` com as credenciais de uma conta de envio de e-mail. Não use a senha normal de uma conta pessoal; use uma credencial SMTP ou senha de aplicativo fornecida pelo serviço de e-mail. Sem estas variáveis, a aplicação inicia normalmente, mas não pode enviar códigos.
6. Instale os pacotes com `npm install` e inicie com `npm start` (ou `npm run dev` durante o desenvolvimento).
7. Abra `http://localhost:3000`. O terminal só informa que o MongoDB está conectado depois que a conexão e os índices do modelo forem confirmados.

O arquivo `.gitignore` ignora `.env` e os demais arquivos `.env.*`, mantendo `.env.example` versionável.

## Deploy na Vercel

O projeto exporta a aplicação Express como uma Vercel Function. Os arquivos estáticos usados pelo site ficam em `public/`, e as páginas HTML são incluídas no pacote da função. O deploy não inicia conexão com o MongoDB durante o build; cada instância conecta ao primeiro acesso que precisa de banco e reaproveita a conexão enquanto estiver aquecida.

1. Envie este repositório para um Git remoto e importe-o na Vercel, mantendo a pasta raiz do projeto como **Root Directory**. Não configure um comando de build nem uma pasta de saída.
2. Em **Project Settings → Environment Variables**, cadastre `MONGODB_URI` com a URI do banco `lavemais` e `JWT_SECRET` com um segredo aleatório de pelo menos 32 caracteres. Para ativar a recuperação de senha, configure também `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM`. Adicione as variáveis aos ambientes **Preview** e **Production** conforme necessário. Não use `MONGODB_TEST_URI` no deploy.
3. No MongoDB Atlas, permita conexões de rede originadas pela Vercel. A lista de IPs de saída varia conforme a configuração/plano Vercel; use uma opção de saída estática compatível ou configure a regra de rede apropriada no Atlas. Não publique a URI no repositório.
4. Crie um deploy Preview para conferir a URL temporária. Consulte `/api/health`: `connected` indica que a function alcançou o MongoDB. Só depois disso faça o deploy Production, se desejado.

O site público pode ser servido mesmo antes da primeira conexão ao banco. Cadastro, login, saúde da API e páginas privadas dependem das variáveis e do acesso ao Atlas; erros de inicialização retornam indisponibilidade sem expor a URI.

Para testar localmente com o emulador da Vercel, instale/execute o CLI oficial e use `vercel dev` após configurar as variáveis de desenvolvimento no projeto. O fluxo local comum permanece `npm start`.

## Testes

- `npm test` executa os testes locais de normalização e validação sem acessar contas de clientes.
- Para exercitar cadastro, e-mail duplicado, hash, login válido/inválido, cookie de sessão e persistência, informe `MONGODB_TEST_URI` apontando para um banco **dedicado e descartável** de testes e rode `npm run test:integration`. O teste cria um endereço aleatório e o remove ao terminar; sem essa variável, o teste fica marcado como ignorado.
- `GET /api/health` indica `connected` apenas quando o driver está conectado.
- A integração do dashboard/perfil com o MongoDB pode ser exercitada no teste de integração existente, que cria e remove somente o usuário aleatório de teste no banco dedicado.

Nunca use a URI de produção como `MONGODB_TEST_URI`.
