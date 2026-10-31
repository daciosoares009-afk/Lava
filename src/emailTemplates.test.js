import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emailBrand,passwordResetEmail,staffRequestEmail,welcomeEmail,passwordChangedEmail,appointmentConfirmedEmail,appointmentCancelledEmail } from './emails/templates.js';
const sample={name:'Cliente <script>alert(1)</script> & Teste',service:'Lavagem <img src=x onerror=alert(1)>',preferredDate:'2026-11-20',staffMessage:'Orientação "confirmada" <script>unsafe()</script>',notes:'Observação & detalhes'};

test('todos os modelos geram HTML estruturado e texto, sem scripts, recursos CSS externos ou links relativos',()=>{
  const messages=[passwordResetEmail({...sample,code:'012345'}),staffRequestEmail(),welcomeEmail(sample),passwordChangedEmail(sample),appointmentConfirmedEmail(sample),appointmentCancelledEmail(sample)];
  for(const mail of messages){
    assert.ok(mail.subject);assert.ok(mail.text);assert.match(mail.html,/<!doctype html>/i);
    const dom=new JSDOM(mail.html);const doc=dom.window.document;
    assert.equal(doc.documentElement.lang,'pt-BR');assert.equal(doc.querySelectorAll('script,link,iframe,form').length,0);
    assert.ok(doc.querySelector('table[role=presentation]'));assert.equal(doc.querySelector('img').src,emailBrand.logoUrl);
    assert.match(doc.querySelector('img').alt,/LaveMais/);
    for(const link of doc.querySelectorAll('a'))assert.ok(new URL(link.href).protocol==='https:');
    assert.doesNotMatch(mail.html,/<script>|<img src=x/);
    assert.equal(doc.querySelector('[onerror]'),null);
    assert.match(mail.html,/@media.*max-width:620px/);assert.match(mail.html,/prefers-color-scheme:dark/);
    assert.ok(Buffer.byteLength(mail.html)<80_000,'HTML stays below common clipping thresholds');
    dom.window.close();
  }
});
test('recuperação mantém zeros, validade e código fora das URLs; saudação usa nome real ou neutra',()=>{
  const mail=passwordResetEmail({code:'012345',name:'Maria Silva'});
  assert.match(mail.text,/Olá, Maria Silva!/);assert.match(mail.text,/012345/);assert.match(mail.html,/012345/);assert.match(mail.text,/10 minutos/);
  const dom=new JSDOM(mail.html);
  for(const a of dom.window.document.querySelectorAll('a'))assert.doesNotMatch(a.href,/012345|token=|code=/);
  assert.match(mail.text,/https:\/\/lava-sand.vercel.app\/recuperar-senha/);
  assert.ok(passwordResetEmail({code:'000001'}).text.startsWith('Olá!'));
  assert.throws(()=>passwordResetEmail({code:'12345'}));dom.window.close();
});
test('origem dinâmica é validada e o aviso da equipe não recebe informações do cliente',()=>{
  const config={appBaseUrl:'https://preview.example',nodeEnv:'production'};
  assert.match(staffRequestEmail(config).text,/https:\/\/preview.example\/equipe/);
  assert.doesNotMatch(staffRequestEmail(config).text,/Cliente|telefone|@gmail/);
  for(const appBaseUrl of ['javascript:alert(1)','https://user:secret@example.com','https://example.com/?token=secret','https://example.com/redirect','http://example.com'])assert.throws(()=>staffRequestEmail({appBaseUrl,nodeEnv:'production'}));
});
test('atendimentos usam datas reais e não inventam horário, cobrança ou benefício',()=>{
  assert.match(appointmentConfirmedEmail(sample).text,/20\/11\/2026/);
  assert.match(appointmentConfirmedEmail(sample).text,/Pagamento/);
  assert.match(appointmentConfirmedEmail({...sample,staffMessage:''}).text,/Não informado/);
  assert.match(appointmentCancelledEmail(sample).subject,/cancelado/);
  assert.throws(()=>appointmentConfirmedEmail({...sample,preferredDate:'2026-02-30'}));
});
