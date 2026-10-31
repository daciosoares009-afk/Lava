import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { siteContent } from '../public/site-content.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function screen(page,path,script) {
  const dom=new JSDOM(await readFile(new URL('../'+page,import.meta.url),'utf8'),{url:'https://lavemais.test'+path,runScripts:'outside-only'});
  const w=dom.window;
  w.scrollTo=()=>{};w.TextEncoder=TextEncoder;w.siteContent=structuredClone(siteContent);
  w.fetch=async()=>({ok:false,status:401,json:async()=>({})});
  w.run=async()=>w.eval((await readFile(new URL('../public/'+script,import.meta.url),'utf8')).replace("import { siteContent } from './site-content.js';",'const siteContent=window.siteContent;'));
  return dom;
}
test('cadastro preserva espaços da senha e limita bytes; abas funcionam pelo teclado',async t=>{
  const dom=await screen('index.html','/login#cadastro','app.js');t.after(()=>dom.window.close());
  const w=dom.window;const sent=[];
  w.fetch=async(url,init)=>{if(init)sent.push(JSON.parse(init.body));return{ok:false,status:400,json:async()=>({error:{message:'fixture'}})};};
  await w.run();
  const form=w.document.querySelector('#register-form');
  const values={fullName:'Cliente Teste',email:'cliente@example.test',phone:'11999999999',birthDate:'1990-01-01',password:' Senha12345678 ',confirmPassword:' Senha12345678 '};
  for(const [key,value]of Object.entries(values))form.elements[key].value=value;
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(sent.length,1);assert.equal(sent[0].password,values.password);
  form.elements.password.value='Senha123'+ 'á'.repeat(40);form.elements.confirmPassword.value=form.elements.password.value;
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(sent.length,1);assert.match(form.elements.password.closest('.field').textContent,/72 bytes/);
  w.document.querySelector('.mode-switch').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  assert.equal(w.document.querySelector('#tab-login').getAttribute('aria-selected'),'true');
  assert.equal(w.document.activeElement.id,'tab-login');
});
test('dashboard carrega perfil, navega por URL e controla foco do menu móvel',async t=>{
  const dom=await screen('dashboard.html','/conta/perfil','dashboard.js');t.after(()=>dom.window.close());
  const w=dom.window;w.innerWidth=400;
  w.fetch=async()=>({ok:true,status:200,json:async()=>({user:{fullName:'Cliente Teste',email:'cliente@example.test',phone:'11999999999',birthDate:'1990-01-01',createdAt:'2020-01-01'}})});
  await w.run();await settle();
  assert.equal(w.document.querySelector('#profile-form').elements.fullName.value,'Cliente Teste');
  assert.equal(w.document.querySelector('.dashboard-panel.is-visible').dataset.panel,'perfil');
  const sidebar=w.document.querySelector('.sidebar');const toggle=w.document.querySelector('.mobile-menu-toggle');
  assert.equal(sidebar.inert,true);toggle.click();assert.equal(sidebar.inert,false);
  assert.equal(sidebar.contains(w.document.activeElement),true);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(sidebar.inert,true);assert.equal(w.document.activeElement,toggle);
  toggle.click();w.document.querySelector('.side-nav [data-nav="servicos"]').click();
  assert.equal(w.location.pathname,'/conta/servicos');assert.equal(sidebar.inert,true);
});
test('home executa os renderizadores sem inventar contatos vazios e mantém âncoras válidas',async t=>{
  const dom=await screen('home.html','/','home.js');t.after(()=>dom.window.close());const w=dom.window;
  await w.run();await settle();
  for(const link of w.document.querySelectorAll('a[href^="#"]'))assert.ok(w.document.querySelector(link.getAttribute('href')));
  assert.ok([...w.document.querySelectorAll('[data-whatsapp-link]')].every(link=>link.hidden));
  assert.equal(w.document.querySelectorAll('[data-recharge-rows] .price-row').length,siteContent.recharges.length);
});

test('solicitações no dashboard carregam, salvam, editam, cancelam e exibem falhas sem inserir HTML',async t=>{
  const dom=await screen('dashboard.html','/conta/agendamentos','dashboard.js');t.after(()=>dom.window.close());
  const w=dom.window; const writes=[];let rows=[],fail=false;
  w.confirm=()=>true;
  w.fetch=async(url,init={})=>{
    if(url==='/api/client/profile') return {ok:true,status:200,json:async()=>({user:{fullName:'Cliente Teste',createdAt:'2020-01-01'}})};
    if(fail)return{ok:false,status:503,json:async()=>({error:{message:'Serviço indisponível'}})};
    if(init.method!=='GET') {
      const body=JSON.parse(init.body);writes.push({url,body,method:init.method});
      rows=[{id:'123',...body,status:url.endsWith('/cancel')?'cancelled':'pending',revision:writes.length-1,preferredDate:body.preferredDate||rows[0]?.preferredDate,service:body.service||rows[0]?.service}];
      return{ok:true,status:200,json:async()=>({appointment:rows[0]})};
    }
    return{ok:true,status:200,json:async()=>({appointments:rows,hasMore:false})};
  };
  await w.run();await settle();
  assert.match(w.document.querySelector('#appointment-list').textContent,/Nenhuma solicitação/);
  const form=w.document.querySelector('#appointment-form');
  const send=async()=>{form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();};
  form.elements.service.value='<img src=x onerror=alert(1)>';
  form.elements.preferredDate.value=new Date(Date.now()+86400000).toISOString().slice(0,10);
  await send();
  assert.equal(writes[0].method,'POST');assert.equal(w.document.querySelector('#appointment-list img'),null);
  w.document.querySelector('#appointment-list button').click();
  form.elements.notes.value='Atualização';await send();
  assert.equal(writes[1].method,'PATCH');assert.equal(writes[1].body.revision,0);
  w.document.querySelectorAll('#appointment-list button')[1].click();await settle();await settle();
  assert.match(writes[2].url,/\/cancel$/);assert.equal(writes[2].body.revision,1);
  assert.match(w.document.querySelector('#appointment-list').textContent,/Cancelada/);
  fail=true;w.document.querySelector('#appointment-refresh').click();await settle();
  assert.match(w.document.querySelector('#appointment-list').textContent,/Serviço indisponível/);
});

test('painel de equipe exibe dados como texto, salva decisão e trata acesso negado',async t=>{
  const dom=await screen('equipe.html','/equipe','equipe.js');t.after(()=>dom.window.close());
  const w=dom.window;w.confirm=()=>true;let denied=false;const writes=[];
  const item={id:'fixture',service:'<img src=x onerror=alert(1)>',preferred_date:'2026-11-01',notes:'Observação',status:'pending',revision:3,customer:{full_name:'Cliente Teste',phone:'11999999999'},staff_history:[],notification_state:'failed',notification_attempts:1};
  w.fetch=async(url,init)=>{
    if(denied)return{ok:false,status:403,json:async()=>({error:{message:'Acesso restrito à equipe.'}})};
    if(init.method==='PATCH'){writes.push(JSON.parse(init.body));return{ok:true,status:200,json:async()=>({saved:true})};}
    return{ok:true,status:200,json:async()=>({appointments:[item],hasMore:false})};
  };
  await w.run();await settle();
  assert.equal(w.document.querySelector('#staff-list img'),null);
  assert.match(w.document.querySelector('#staff-list').textContent,/falhou/);
  const form=w.document.querySelector('form');form.elements.message.value='Confirmado às 10h, pagamento na unidade.';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();
  assert.equal(writes[0].revision,3);assert.equal(writes[0].status,'confirmed');
  assert.match(w.document.querySelector('#staff-feedback').textContent,/Decisão salva/);
  denied=true;w.document.querySelector('#staff-refresh').click();await settle();
  assert.match(w.document.querySelector('#staff-list').textContent,/Acesso restrito/);
});

test('resumo exibe dados reais, detalhes seguros, cancelamento e recuperação de falha',async t=>{
  const dom=await screen('dashboard.html','/conta','dashboard.js');t.after(()=>dom.window.close());
  const w=dom.window;let fail=false,cancelled=false;w.confirm=()=>true;
  const item={id:'owner-record',service:'<img src=x>',preferredDate:'2099-11-01',notes:'Observação real',status:'pending',revision:4};
  w.fetch=async(url,init={})=>{
    if(url==='/api/client/profile')return{ok:true,status:200,json:async()=>({user:{fullName:'Maria Silva',createdAt:'2020-01-01'}})};
    if(url.endsWith('/cancel')){assert.equal(JSON.parse(init.body).revision,4);cancelled=true;return{ok:true,status:200,json:async()=>({})};}
    if(url==='/api/client/dashboard')return{ok:!fail,status:fail?503:200,json:async()=>({upcomingCount:cancelled?0:1,next:cancelled?null:item,recent:[{...item,status:cancelled?'cancelled':'pending'}]})};
    return{ok:true,status:200,json:async()=>({appointments:[],hasMore:false})};
  };
  await w.run();await settle();
  assert.equal(w.document.querySelector('[data-upcoming]').textContent,'1');
  assert.equal(w.document.querySelector('#next-appointment img'),null);
  const detail=w.document.querySelector('#next-appointment button');detail.click();
  assert.equal(detail.getAttribute('aria-expanded'),'true');
  assert.match(w.document.querySelector('#next-appointment').textContent,/Observação real/);
  w.document.querySelectorAll('#next-appointment button')[1].click();await settle();await settle();
  assert.equal(w.document.querySelector('[data-upcoming]').textContent,'0');
  assert.match(w.document.querySelector('#next-appointment').textContent,/Solicitar atendimento/);
  fail=true;w.document.querySelector('#appointment-refresh').click();await settle();
  // A new successful write refreshes the overview as well.
  const form=w.document.querySelector('#appointment-form');form.elements.service.value='Lavagem';form.elements.preferredDate.value='2099-11-01';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();
  assert.match(w.document.querySelector('#dashboard-feedback').textContent,/Tentar novamente/);
  fail=false;w.document.querySelector('#dashboard-feedback button').click();await settle();
  assert.equal(w.document.querySelector('#dashboard-summary').getAttribute('aria-busy'),'false');
  assert.equal(w.document.querySelector('#dashboard-feedback').textContent,'');
});

test('login apresenta segundo fator sem redirecionar ou guardar desafio no navegador',async t=>{
  const dom=await screen('index.html','/login','app.js');t.after(()=>dom.window.close());const w=dom.window;
  w.fetch=async(_url,init)=>({ok:Boolean(init),status:init?200:401,json:async()=>init?{mfaRequired:true,challenge:'fixture-challenge'}:{}});
  await w.run();const login=w.document.querySelector('#login-form');login.elements.email.value='fixture@example.test';login.elements.password.value='Old12345';
  login.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert.equal(login.hidden,true);assert.equal(w.document.querySelector('#mfa-login-form').hidden,false);assert.equal(login.elements.password.value,'');
  assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);
  w.document.querySelector('#mfa-back').click();assert.equal(login.hidden,false);assert.equal(w.document.querySelector('#mfa-login-form').hidden,true);
});

test('retorno Google continua preenchimento mesmo após normalização da URL',async t=>{
  const dom=await screen('index.html','/login?google=continue','app.js');t.after(()=>dom.window.close());const w=dom.window;
  w.fetch=async url=>({ok:String(url).endsWith('/google/pending'),json:async()=>({pending:true,email:'google@example.test',name:'Cliente Google'})});
  await w.run();await settle();
  assert.equal(w.document.querySelector('#google-login').getAttribute('href'),'/api/auth/google');
  assert.equal(w.document.querySelector('#login-form').elements.email.value,'google@example.test');
  assert.equal(w.document.querySelector('#register-form').elements.fullName.value,'Cliente Google');
  assert.match(w.document.querySelector('#google-feedback').textContent,/Google confirmado/);
});

test('MFA retoma confirmação pendente após recarregar e exibe erro do servidor',async t=>{
  const dom=await screen('dashboard.html','/conta/perfil','mfa.js');t.after(()=>dom.window.close());const w=dom.window,sent=[];
  w.fetch=async(url,init)=>{if(init?.method==='POST'){sent.push(url);return{ok:false,json:async()=>({error:{message:'Código inválido ou expirado.'}})};}return{ok:true,json:async()=>({enabled:false,available:true,pending:true})};};
  await w.run();await settle();
  const form=w.document.querySelector('#mfa-settings-form');
  assert.equal(w.document.querySelector('#mfa-settings').hidden,false);assert.equal(w.document.querySelector('#mfa-action').textContent,'Confirmar ativação');
  form.elements.password.value='FixturePassword123';form.elements.code.value='123456';
  form.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
  assert.deepEqual(sent,['/api/auth/mfa/confirm']);assert.match(w.document.querySelector('#mfa-state').textContent,/Código inválido/);
});

test('clique MFA informa campos faltantes e progresso antes da resposta',async t=>{
  const dom=await screen('dashboard.html','/conta/perfil','mfa.js');t.after(()=>dom.window.close());const w=dom.window;
  let respond,posts=0;
  w.fetch=async(_url,init)=>{if(init?.method==='POST'){posts++;return new Promise(resolve=>respond=resolve);}return{ok:true,json:async()=>({enabled:false,available:true,pending:true})};};
  await w.run();await settle();
  const form=w.document.querySelector('#mfa-settings-form'),button=w.document.querySelector('#mfa-action'),status=w.document.querySelector('#mfa-state');
  button.click();assert.match(status.textContent,/Informe sua senha/);assert.equal(posts,0);
  form.elements.password.value='FixturePassword123';button.click();assert.match(status.textContent,/Informe o código/);assert.equal(posts,0);
  form.elements.code.value='123456';button.click();assert.match(status.textContent,/Confirmando ativação/);assert.equal(button.disabled,true);assert.equal(posts,1);
  respond({ok:true,json:async()=>({enabled:true,recoveryCodes:['fixture-only']})});await settle();
  assert.match(status.textContent,/Segundo fator ativado/);assert.equal(w.document.querySelector('#mfa-recovery').hidden,false);assert.equal(button.disabled,false);
});
