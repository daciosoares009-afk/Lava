// Identidade compartilhada dos e-mails. Sem dependências de CSS ou fontes externas.
export const emailBrand = Object.freeze({
  name: 'LaveMais', origin: 'https://lava-sand.vercel.app',
  logoUrl: 'https://lava-sand.vercel.app/logo-lavemais-email.png',
  navy: '#102b70', deep: '#0b2057', turquoise: '#08b9cb', lime: '#c8d927',
  background: '#f6f8fc', text: '#192646', muted: '#596681', line: '#dfe5ef',
  font: 'Arial, Helvetica, sans-serif',
});
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function origin(config = {}) {
  const url = new URL(config.appBaseUrl || emailBrand.origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || (config.nodeEnv !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error('Origem de e-mail inválida.');
  return url.origin;
}
const greeting = name => name?.trim() ? `Olá, ${name.trim()}!` : 'Olá!';
const paragraph = text => `<p class="body-copy" style="margin:0 0 18px;color:${emailBrand.text};font-size:16px;line-height:26px;">${escapeHtml(text)}</p>`;
function card(rows) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${emailBrand.line};border-radius:12px;margin:6px 0 24px;"><tr><td class="info-card" style="padding:20px;background:${emailBrand.background};border-radius:12px;">${rows.map(([label,value])=>`<p class="muted" style="margin:0 0 4px;color:${emailBrand.muted};font-size:12px;line-height:18px;font-weight:bold;">${escapeHtml(label)}</p><p class="body-copy" style="margin:0 0 16px;color:${emailBrand.deep};font-size:16px;line-height:24px;overflow-wrap:anywhere;">${escapeHtml(value)}</p>`).join('')}</td></tr></table>`;
}
function layout({subject,preheader,name,title,body,text,cta,security},config) {
  const b=emailBrand, base=origin(config), site=base+'/';
  const button=cta ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 18px;"><tr><td align="center" bgcolor="${b.lime}" style="border-radius:8px;mso-padding-alt:16px 24px;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;border:1px solid ${b.lime};border-radius:8px;background:${b.lime};color:${b.deep};font-size:16px;font-weight:bold;line-height:24px;padding:15px 24px;text-decoration:none;text-align:center;">${escapeHtml(cta.label)}</a></td></tr></table><p class="muted" style="margin:0 0 24px;color:${b.muted};font-size:12px;line-height:20px;overflow-wrap:anywhere;">Se o botão não abrir, acesse:<br><a class="footer-link" href="${escapeHtml(cta.url)}" style="color:#087f96;text-decoration:underline;overflow-wrap:anywhere;">${escapeHtml(cta.url)}</a></p>` : '';
  const html=`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(subject)}</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}a{overflow-wrap:anywhere}@media only screen and (max-width:620px){.outer-pad{padding:16px 8px!important}.content-pad{padding:28px 22px!important}.email-title{font-size:28px!important;line-height:34px!important}.brand-pad{padding:26px 20px!important}}@media(prefers-color-scheme:dark){body,.email-bg{background:#09172f!important}.email-card{background:#14243e!important}.body-copy,.email-title{color:#f3f7ff!important}.muted{color:#c4d0e5!important}.info-card{background:#1c3150!important}.footer-link{color:#60d9e4!important}}</style></head>
<body style="margin:0;padding:0;width:100%;background:${b.background};font-family:${b.font};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" class="email-bg" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${b.background}"><tr><td align="center" class="outer-pad" style="padding:36px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
<tr><td height="5" bgcolor="${b.turquoise}" style="height:5px;font-size:1px;line-height:5px;border-radius:16px 16px 0 0;">&nbsp;</td></tr>
<tr><td align="center" class="brand-pad" bgcolor="${b.navy}" style="padding:30px 24px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td bgcolor="#ffffff" style="padding:10px 18px;border-radius:10px;"><a href="${escapeHtml(site)}" aria-label="LaveMais"><img src="${b.logoUrl}" width="200" alt="LaveMais Lavanderia Self Service" style="display:block;width:200px;max-width:100%;height:auto;background:#ffffff;color:${b.navy};font-size:18px;"></a></td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#d2edf1;letter-spacing:1px;">CUIDADO QUE SIMPLIFICA</p></td></tr>
<tr><td class="email-card content-pad" bgcolor="#ffffff" style="padding:36px 40px;border-left:1px solid ${b.line};border-right:1px solid ${b.line};">
<p class="muted" style="margin:0 0 12px;color:${b.muted};font-size:15px;line-height:24px;">${escapeHtml(greeting(name))}</p>
<h1 class="email-title" style="margin:0 0 22px;color:${b.deep};font-family:${b.font};font-size:32px;line-height:39px;font-weight:700;letter-spacing:-1px;">${escapeHtml(title)}</h1>
${body}${button}${security?`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:1px solid ${b.line};padding:20px 0 0;"><p class="muted" style="margin:0;color:${b.muted};font-size:13px;line-height:21px;">${escapeHtml(security)}</p></td></tr></table>`:''}
</td></tr><tr><td class="email-card" bgcolor="#ffffff" style="padding:0 40px 30px;border:1px solid ${b.line};border-top:0;border-radius:0 0 16px 16px;">
<p class="body-copy" style="margin:0 0 4px;color:${b.deep};font-size:15px;line-height:22px;font-weight:bold;">LaveMais</p><p class="muted" style="margin:0;color:${b.muted};font-size:13px;line-height:21px;">Mais tempo para o que importa.</p></td></tr>
<tr><td align="center" style="padding:22px 20px;"><p class="muted" style="margin:0 0 8px;color:${b.muted};font-size:12px;line-height:19px;">Mensagem enviada automaticamente pelo sistema LaveMais.</p><a class="footer-link" href="${escapeHtml(site)}" style="color:#087f96;font-size:12px;line-height:20px;text-decoration:underline;">Visitar o site oficial</a></td></tr>
</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  return {subject,html,text:[greeting(name),title,text,cta?`${cta.label}: ${cta.url}`:'',security||'','LaveMais — Mais tempo para o que importa.','Mensagem enviada automaticamente pelo sistema LaveMais.',`Site oficial: ${site}`].filter(Boolean).join('\n\n')};
}

export function passwordResetEmail({name,code},config={}) {
  if(!/^\d{6}$/.test(code))throw new Error('Código de recuperação inválido.');
  return layout({subject:'Código para redefinir sua senha | LaveMais',preheader:'Seu código de recuperação é válido por 10 minutos.',name,title:'Vamos recuperar seu acesso.',
    body:paragraph('Recebemos um pedido para redefinir a senha da sua conta. Digite o código abaixo na página de recuperação.')+
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 24px;"><tr><td class="info-card" align="center" bgcolor="${emailBrand.background}" style="padding:24px 12px;border:1px solid ${emailBrand.line};border-radius:12px;"><p class="muted" style="margin:0 0 12px;color:${emailBrand.muted};font-size:12px;font-weight:bold;line-height:18px;">SEU CÓDIGO DE RECUPERAÇÃO</p><p class="body-copy" style="margin:0;color:${emailBrand.deep};font-family:Consolas,'Courier New',monospace;font-size:36px;line-height:44px;font-weight:bold;letter-spacing:6px;">${escapeHtml(code)}</p><p class="muted" style="margin:12px 0 0;color:${emailBrand.muted};font-size:13px;line-height:20px;">Válido por 10 minutos. Uso único.</p></td></tr></table>`,
    text:`Seu código para redefinir a senha é: ${code}\n\nEle expira em 10 minutos e só pode ser usado uma vez. Digite-o na página de recuperação.`,
    cta:{label:'Redefinir minha senha',url:origin(config)+'/recuperar-senha'},security:'Nunca compartilhe este código. Se você não solicitou a redefinição, ignore este e-mail. O botão abre a página de recuperação; ele não altera sua senha automaticamente.'},config);
}
export function staffRequestEmail(config={}) {
  return layout({subject:'Nova solicitação | LaveMais',preheader:'Uma nova solicitação aguarda análise no painel.',name:'equipe LaveMais',title:'Uma nova solicitação chegou.',
    body:paragraph('Acesse o painel autenticado para consultar os detalhes e conferir a disponibilidade antes de confirmar o atendimento.')+card([['Próximo passo','Analisar a solicitação no painel da equipe.'],['Pagamento','Exclusivamente na unidade.']]),
    text:'Há uma nova solicitação de atendimento. Consulte o painel autenticado para conferir a situação atual. Pagamento exclusivamente na unidade.',cta:{label:'Abrir painel da equipe',url:origin(config)+'/equipe'},security:'Os dados do cliente ficam disponíveis somente no painel autenticado. Este aviso não confirma nem reserva máquinas.'},config);
}
// Modelos disponíveis para prévia/reuso. Sem novos disparos no cadastro ou
// nas decisões de atendimento: esses envios não existem no fluxo atual.
export function welcomeEmail({name},config={}) {
  return layout({subject:'Bem-vindo à LaveMais',preheader:'Sua conta LaveMais foi criada.',name,title:'Mais praticidade começa aqui.',body:paragraph('Seu cadastro foi concluído. Na sua conta, você pode atualizar seus dados, registrar solicitações de atendimento e acompanhar as orientações da equipe.')+card([['Seu atendimento','Solicitações dependem de confirmação da unidade.'],['Pagamento','Presencial, na unidade.']]),text:'Seu cadastro foi concluído. Acesse sua conta para atualizar seus dados e acompanhar solicitações. O atendimento depende de confirmação da unidade. Pagamento presencial.',cta:{label:'Acessar minha conta',url:origin(config)+'/conta'}},config);
}
export function passwordChangedEmail({name},config={}) {
  return layout({subject:'Sua senha foi alterada | LaveMais',preheader:'Confirmação de alteração de senha da sua conta.',name,title:'Sua senha foi alterada.',body:paragraph('A alteração da senha da sua conta foi concluída. Você já pode entrar com a nova senha.'),text:'A alteração da senha da sua conta foi concluída. Você já pode entrar com a nova senha.',cta:{label:'Acessar minha conta',url:origin(config)+'/login'},security:'Não reconhece esta alteração? Acesse o site oficial e solicite a recuperação da sua conta. Não compartilhe sua senha ou códigos de acesso.'},config);
}
function appointmentEmail(kind,{name,service,preferredDate,staffMessage,notes},config={}) {
  const date=new Date(`${preferredDate}T00:00:00Z`);
  if(!service?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)||Number.isNaN(+date)||date.toISOString().slice(0,10)!==preferredDate)throw new Error('Dados de atendimento inválidos.');
  const formatted=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(date);
  const confirmed=kind==='confirmed';
  const title=confirmed?'Seu atendimento foi confirmado.':'Seu atendimento foi cancelado.';
  const intro=confirmed?'A equipe confirmou o atendimento para a data abaixo. Confira as orientações e o horário combinado.':'O atendimento abaixo foi cancelado. Consulte sua conta para acompanhar o registro ou enviar uma nova solicitação.';
  const rows=[['Serviço',service],['Data',formatted]];
  if(staffMessage?.trim()) rows.push(['Orientações da equipe / horário combinado',staffMessage]);
  else if(confirmed) rows.push(['Horário','Não informado. Consulte a unidade antes de se deslocar.']);
  if(notes?.trim())rows.push(['Observações',notes]);
  if(confirmed)rows.push(['Pagamento','Presencial, na unidade.']);
  return layout({subject:`${confirmed?'Atendimento confirmado':'Atendimento cancelado'} | LaveMais`,preheader:title,name,title,body:paragraph(intro)+card(rows),text:intro+'\n\n'+rows.map(([label,value])=>`${label}: ${value}`).join('\n'),cta:{label:'Consultar atendimento',url:origin(config)+'/conta/agendamentos'}},config);
}
export const appointmentConfirmedEmail=(data,config)=>appointmentEmail('confirmed',data,config);
export const appointmentCancelledEmail=(data,config)=>appointmentEmail('cancelled',data,config);
