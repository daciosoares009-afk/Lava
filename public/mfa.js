const section=document.querySelector('#mfa-settings'), form=document.querySelector('#mfa-settings-form');
const state=document.querySelector('#mfa-state'), action=document.querySelector('#mfa-action');
let enabled=false, pending=false;
async function call(path,body) {
  const response=await fetch('/api/auth/mfa/'+path,{credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message||'Não foi possível atualizar o segundo fator.');
  return data;
}
async function load() {
  try { const status=await call('status'); if(!status.available&&!status.enabled)return; enabled=status.enabled; section.hidden=false; state.textContent=enabled?'Autenticação de dois fatores ativa.':'Proteja seus próximos acessos com um aplicativo autenticador.'; action.textContent=enabled?'Desativar segundo fator':'Configurar segundo fator'; }
  catch { /* O perfil continua disponível quando a configuração de MFA não pode ser consultada. */ }
}
form?.addEventListener('submit',async event=>{
  event.preventDefault(); action.disabled=true;
  try {
    const body={password:form.elements.password.value,code:form.elements.code.value.trim()};
    const data=await call(enabled?'disable':pending?'confirm':'setup',body);
    if(data.secret) { pending=true; document.querySelector('#mfa-secret').textContent=data.secret; document.querySelector('#mfa-enrollment').hidden=false; action.textContent='Confirmar ativação'; form.elements.code.required=true; form.elements.code.focus(); state.textContent='Chave criada. Confirme com um código do aplicativo.'; }
    else {
      enabled=data.enabled; pending=false; form.reset(); form.elements.code.required=false;
      document.querySelector('#mfa-enrollment').hidden=true; document.querySelector('#mfa-secret').textContent='';
      state.textContent=enabled?'Segundo fator ativado. Guarde seus códigos de recuperação.':'Segundo fator desativado. Outras sessões foram encerradas.';
      action.textContent=enabled?'Desativar segundo fator':'Configurar segundo fator';
      if(data.recoveryCodes) {document.querySelector('#mfa-recovery').hidden=false;document.querySelector('#mfa-recovery-codes').textContent=data.recoveryCodes.join('\n');}
    }
  } catch(error) {state.textContent=error.message;}
  finally {action.disabled=false;}
});
document.querySelector('#mfa-hide-codes')?.addEventListener('click',()=>{document.querySelector('#mfa-recovery-codes').textContent='';document.querySelector('#mfa-recovery').hidden=true;});
load();
