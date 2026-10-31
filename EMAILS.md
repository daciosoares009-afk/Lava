# E-mails LaveMais

## Implementação e escopo

Camada reutilizável em `src/emails/templates.js`: marca, cores do site (#102b70, #0b2057, #08b9cb, #c8d927), logo oficial, layout, saudação, cards, CTA, fallback do link, rodapé, HTML e texto simples. Arial/Helvetica como fontes locais compatíveis, sem fontes externas. A logo derivada remove somente a área transparente excedente do PNG original e mantém o desenho; `public/logo-lavemais.png` foi preservado.

| Modelo | Situação nesta entrega |
| --- | --- |
| Recuperação de senha | Integrado ao envio existente por Nodemailer/SMTP |
| Nova solicitação para a equipe | Integrado ao envio existente por Nodemailer/SMTP |
| Boas-vindas | Modelo pronto para prévia; nenhum disparo adicionado ao cadastro |
| Senha alterada | Modelo pronto para prévia; nenhum novo disparo após reset |
| Confirmação de atendimento | Modelo pronto para prévia; nenhum novo envio ao cliente |
| Cancelamento de atendimento | Modelo pronto para prévia; nenhum novo envio ao cliente |
| Verificação de e-mail | Não implementado: esse fluxo, token e endpoint não existem no projeto |

Os quatro modelos sem disparo têm funções exportadas e aceitam dados reais, mas não são chamados pelos endpoints existentes. Isso preserva a regra de mudar a apresentação sem adicionar comunicações automáticas. Nenhuma integração Resend foi encontrada; SMTP, destinatários, validade do código, consumo único, revogação de sessões, controle de tentativas e comportamento de erro foram preservados.

Recuperação continua usando **código de seis dígitos válido por dez minutos**, sem token no link. O CTA abre a página de recuperação; não autentica ou troca senha sozinho. O nome é consultado por ID da conta já localizada; se a leitura de apresentação falhar, a saudação fica neutra e o envio prossegue. O aviso da equipe não inclui dados pessoais do cliente.

Atendimentos usam serviço, data e orientação disponíveis no modelo atual. Não foi criado um campo de horário nem inventado um horário a partir da data. Quando a orientação está ausente, o modelo de confirmação informa que o horário não foi fornecido. Pagamento sempre presencial.

## Visualizar sem enviar

```powershell
npm run emails:preview
```

Abra `http://127.0.0.1:3100`. O índice lista os seis modelos, links para HTML e texto simples e distingue os envios existentes dos modelos sem disparo. Encerre com Ctrl+C.

Para gerar somente os arquivos:

```powershell
npm run emails:build
```

Abra `.email-previews/index.html`. Os arquivos são ignorados pelo Git e ficam fora de `public/`, sem exposição no servidor principal/Vercel. O gerador não carrega `.env`, não importa SMTP e não acessa banco. Os dados estão identificados como exemplo, com código ilustrativo `000000`. A prévia copia a logo localmente para funcionar antes do deploy; o e-mail real usa a URL absoluta pública.

## URLs e publicação

- Site oficial e fallback de origem: `https://lava-sand.vercel.app`.
- Logo: `https://lava-sand.vercel.app/logo-lavemais-email.png`.
- `APP_BASE_URL` existente é usado quando configurado para os links do ambiente. Deve ser uma origem HTTPS sem caminho/query/credenciais; localhost HTTP é permitido apenas fora de produção.
- Publicar o novo asset `public/logo-lavemais-email.png` junto com o código antes de usar os novos modelos em produção. A versão pública anterior ainda não possui esse arquivo. Não foi realizado deploy nesta etapa.
- Não foram adicionadas variáveis ou chaves. Não são necessários tokens novos para estilizar os envios.

## Validação

- `npm test`: 39 testes, 38 aprovados, zero falhas, um teste Mongo externo ignorado. HTML e texto são verificados nos transportes SMTP isolados de recuperação e avisos, incluindo nome real no reset e código idêntico nas duas partes.
- Testes específicos: links absolutos, recusa de origens inseguras, escape de HTML, preservação de zeros no código, validade textual, ausência de código/token nas URLs, logo/alt, tabelas de apresentação, CSS inline, ausência de scripts e folhas externas, datas válidas e ausência de dados pessoais no aviso da equipe.
- `npm run check`: sintaxe JavaScript aprovada.
- Renderização Chrome headless com perfil isolado: seis modelos a 390 px sem overflow horizontal, logo carregada. Recuperação também a 900 px e no modo escuro a 390 px; imagens inspecionadas visualmente.
- HTML usa largura fluida com máximo de 600 px, tabelas estruturais, fallback condicional para Outlook, cores/background inline e melhorias progressivas por media query. A versão texto mantém todas as instruções importantes, inclusive com imagens bloqueadas.
- Não foram enviados e-mails reais nesta etapa. Testes específicos em Gmail, Outlook desktop/web e Apple Mail ainda não foram executados; a renderização de cada cliente e a inversão automática de cores podem variar. Não há alegação de certificação nesses clientes.

## Arquivos criados e modificados

Criados:
- `src/emails/templates.js`
- `src/emailTemplates.test.js`
- `scripts/preview-emails.js`
- `public/logo-lavemais-email.png`
- `EMAILS.md`

Modificados:
- `src/routes/auth.js`: aplica o template no envio de recuperação.
- `src/staffNotifications.js`: aplica o template no aviso à equipe.
- `src/supabase.integration.test.js`, `src/staffWorkflow.test.js`: conferem o HTML real entregue ao transporte isolado.
- `package.json`: comandos de geração e visualização local.
- `.gitignore`: exclui artefatos de prévia.
- `README.md`: referência a este documento e ao comando de visualização.

As alterações anteriores em `recuperar-senha.html`, `public/recuperar-senha.js` e o teste do campo de código foram preservadas, sem fazer parte do redesenho dos e-mails. Nenhuma migração ou alteração de banco foi necessária.
