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
  const values={fullName:'Cliente Teste',email:'cliente@example.test',phone:'11999999999',birthDate:'1990-01-01',password:' Senha123 ',confirmPassword:' Senha123 '};
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
