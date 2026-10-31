import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('código mantém seis dígitos e zeros, normaliza cópia e não trunca entradas inválidas',async t=>{
  const html=await readFile(new URL('../recuperar-senha.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../public/recuperar-senha.js',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/recuperar-senha',runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;w.TextEncoder=TextEncoder;
  const requests=[];w.fetch=async(url,init)=>{requests.push(JSON.parse(init.body));return{ok:false,json:async()=>({error:{message:'Código de teste inválido'}})};};
  w.eval(js);const form=w.document.querySelector('#confirm-form');form.hidden=false;
  const input=form.elements.code;
  assert.equal(input.hasAttribute('maxlength'),false);
  function enter(value,cursor=value.length){input.value=value;input.setSelectionRange(cursor,cursor);input.dispatchEvent(new w.Event('input',{bubbles:true}));}
  for(const char of '012345')enter(input.value+char);
  assert.equal(input.value,'012345');
  enter(' 012 345\u200b\n');assert.equal(input.value,'012345');
  enter('012-345');assert.equal(input.value,'012345');
  enter('012 345',4);assert.equal(input.selectionStart,3);
  form.elements.email.value='fixture@example.test';form.elements.password.value='FixturePassword123';form.elements.confirmPassword.value='FixturePassword123';
  enter('0123456');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(input.value,'0123456');assert.equal(requests.length,0);assert.equal(input.getAttribute('aria-invalid'),'true');
  enter('012345');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,1);assert.equal(requests[0].code,'012345');
});
