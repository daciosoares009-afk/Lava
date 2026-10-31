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
  try {
    const status=await call('status');
    section.hidden=false;enabled=status.enabled;pending=Boolean(status.pending);
    if(!status.available&&!enabled){state.textContent='O segundo fator ainda não está disponível neste ambiente. A configuração do servidor precisa ser concluída.';form.hidden=true;return;}
    form.elements.code.required=enabled||pending;
    state.textContent=enabled?'Autenticação de dois fatores ativa.':pending?'Ativação pendente. Informe sua senha e o código do autenticador para concluir. Se ainda não guardou a chave, reinicie a configuração.':'Proteja seus próximos acessos com um aplicativo autenticador.';
    action.textContent=enabled?'Desativar segundo fator':pending?'Confirmar ativação':'Configurar segundo fator';
    document.querySelector('#mfa-restart').hidden=!pending;
  } catch(error) {section.hidden=false;state.textContent='Não foi possível consultar o segundo fator. '+error.message;form.hidden=true;}
}
form?.addEventListener('submit',async event=>{
  event.preventDefault(); action.disabled=true;
  try {
    const body={password:form.elements.password.value,code:form.elements.code.value.trim()};
    const data=await call(enabled?'disable':pending?'confirm':'setup',body);
    if(data.secret) { pending=true; document.querySelector('#mfa-restart').hidden=false; document.querySelector('#mfa-secret').textContent=data.secret; document.querySelector('#mfa-enrollment').hidden=false; action.textContent='Confirmar ativação'; form.elements.code.required=true; form.elements.code.focus(); state.textContent='Chave criada. Confirme com um código do aplicativo.'; }
    else {
      enabled=data.enabled; pending=false; document.querySelector('#mfa-restart').hidden=true; form.reset(); form.elements.code.required=false;
      document.querySelector('#mfa-enrollment').hidden=true; document.querySelector('#mfa-secret').textContent='';
      state.textContent=enabled?'Segundo fator ativado. Guarde seus códigos de recuperação.':'Segundo fator desativado. Outras sessões foram encerradas.';
      action.textContent=enabled?'Desativar segundo fator':'Configurar segundo fator';
      if(data.recoveryCodes) {document.querySelector('#mfa-recovery').hidden=false;document.querySelector('#mfa-recovery-codes').textContent=data.recoveryCodes.join('\n');}
    }
  } catch(error) {state.textContent=error.message;}
  finally {action.disabled=false;}
});
document.querySelector('#mfa-hide-codes')?.addEventListener('click',()=>{document.querySelector('#mfa-recovery-codes').textContent='';document.querySelector('#mfa-recovery').hidden=true;});
document.querySelector('#mfa-restart')?.addEventListener('click',()=>{
  if(!window.confirm('Reiniciar invalida a chave anterior. Será necessário adicionar a nova chave ao autenticador. Continuar?'))return;
  pending=false;form.elements.code.required=false;form.elements.code.value='';
  document.querySelector('#mfa-secret').textContent='';document.querySelector('#mfa-enrollment').hidden=true;
  document.querySelector('#mfa-restart').hidden=true;
  action.textContent='Configurar segundo fator';state.textContent='Informe sua senha e configure uma nova chave. A chave anterior só será substituída quando a nova configuração for criada.';
});
load();
