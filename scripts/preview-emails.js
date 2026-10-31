import { mkdir,writeFile,readFile,copyFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emailBrand,passwordResetEmail,staffRequestEmail,welcomeEmail,passwordChangedEmail,appointmentConfirmedEmail,appointmentCancelledEmail } from '../src/emails/templates.js';

// Dados explicitamente de exemplo; não carrega .env, não conecta ao banco,
// não importa Nodemailer e nunca envia mensagens.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','.email-previews');
const sample={name:'Cliente de exemplo',service:'Serviço de exemplo',preferredDate:'2026-11-20',staffMessage:'Exemplo de orientação: atendimento às 10h. Pagamento na unidade.'};
const templates=[
  ['recuperacao','Recuperação de senha','Envio existente',passwordResetEmail({...sample,code:'000000'})],
  ['equipe','Aviso à equipe','Envio existente',staffRequestEmail()],
  ['boas-vindas','Boas-vindas','Modelo sem disparo automático',welcomeEmail(sample)],
  ['senha-alterada','Senha alterada','Modelo sem disparo automático',passwordChangedEmail(sample)],
  ['confirmacao','Confirmação de atendimento','Modelo sem disparo automático',appointmentConfirmedEmail(sample)],
  ['cancelamento','Cancelamento de atendimento','Modelo sem disparo automático',appointmentCancelledEmail(sample)],
];
await mkdir(root,{recursive:true});
await copyFile(path.resolve(root,'..','public','logo-lavemais-email.png'),path.join(root,'logo.png'));
for(const [key,,,mail]of templates){await writeFile(path.join(root,key+'.html'),mail.html.replace(emailBrand.logoUrl,'logo.png'));await writeFile(path.join(root,key+'.txt'),mail.text);}
const index=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévias de e-mail | LaveMais</title><body style="margin:0;background:#f6f8fc;color:#192646;font:16px/1.6 Arial,sans-serif;padding:24px"><main style="max-width:900px;margin:auto"><h1 style="color:#102b70">E-mails LaveMais</h1><p>Prévias locais com dados de exemplo. Nenhum e-mail é enviado. O código 000000 é ilustrativo.</p><p>Verificação de e-mail não é implementada: não existe esse fluxo na aplicação.</p>${templates.map(([key,title,status])=>`<section style="padding:18px;margin:16px 0;background:white;border:1px solid #dfe5ef;border-radius:12px"><h2 style="margin:0;color:#102b70">${title}</h2><p>${status}</p><a href="${key}.html">Abrir HTML</a> · <a href="${key}.txt">Abrir texto simples</a></section>`).join('')}</main></body></html>`;
await writeFile(path.join(root,'index.html'),index);
console.log('Prévias geradas em '+path.join(root,'index.html'));
if(process.argv.includes('--serve')){
  const allowed=new Set(['index.html','logo.png',...templates.flatMap(([key])=>[key+'.html',key+'.txt'])]);
  const server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const name=pathname==='/'?'index.html':pathname.slice(1);
    if(!allowed.has(name)||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
    try{const content=await readFile(path.join(root,name));res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':name.endsWith('.txt')?'text/plain; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:content);}
    catch{res.writeHead(500);res.end('Falha ao abrir a prévia.');}
  });
  server.on('error',error=>{console.error('Não foi possível abrir o servidor de prévias:',error.code);process.exitCode=1;});
  server.listen(3100,'127.0.0.1',()=>console.log('Abra http://127.0.0.1:3100 — Ctrl+C para encerrar.'));
}
