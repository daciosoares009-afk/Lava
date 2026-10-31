const list=document.querySelector('#staff-list'),feedback=document.querySelector('#staff-feedback'),filter=document.querySelector('#staff-status');
const prev=document.querySelector('#staff-prev'),next=document.querySelector('#staff-next');
let page=1,generation=0;
const labels={pending:'Pendente',confirmed:'Confirmada',cancelled:'Cancelada',completed:'Concluída'};
async function api(path,method='GET',body){
  const response=await fetch('/api/staff/appointments'+path,{method,credentials:'same-origin',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  if(response.status===401){window.location.replace('/login');throw new Error('Entre novamente e abra /equipe.');}
  const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Operação indisponível.');return result;
}
function message(text,error=false){feedback.textContent=text;feedback.classList.toggle('is-error',error);}
function text(tag,value){return Object.assign(document.createElement(tag),{textContent:value});}
async function load(){
  const current=++generation;prev.disabled=next.disabled=true;list.textContent='Carregando atendimentos…';list.setAttribute('aria-busy','true');
  try{
    const result=await api(`?status=${filter.value}&page=${page}`);if(current!==generation)return;
    list.replaceChildren();if(!result.appointments.length)list.textContent='Nenhum atendimento neste filtro.';
    for(const item of result.appointments){
      const article=document.createElement('article');article.className='appointment-record';
      article.append(text('h2',item.service),text('p',`${item.preferred_date.split('-').reverse().join('/')} · ${labels[item.status]}`),text('p',`${item.customer?.full_name||'Cliente indisponível'} · ${item.customer?.phone||'Telefone indisponível'}`),text('p',item.notes||'Sem observações.'));
      if(item.staff_message)article.append(text('p',`Orientação ao cliente: ${item.staff_message}`));
      if(['pending','confirmed'].includes(item.status)){
        const form=document.createElement('form');form.className='profile-form';
        const field=document.createElement('div');field.className='profile-field';
        const label=text('label','Orientação ao cliente (inclua o horário combinado)');label.htmlFor='message-'+item.id;
        const input=document.createElement('input');input.id=label.htmlFor;input.name='message';input.required=true;input.minLength=3;input.maxLength=500;input.value=item.staff_message||'';field.append(label,input);form.append(field);
        const select=document.createElement('select');select.name='status';select.setAttribute('aria-label','Nova situação');
        for(const value of (item.status==='pending'?['confirmed','cancelled']:['completed','cancelled'])){const option=text('option',labels[value]);option.value=value;select.append(option);}form.append(select);
        const save=text('button','Salvar decisão');save.type='submit';save.className='button-primary';form.append(save);
        form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;if(!window.confirm(`Alterar atendimento para ${labels[select.value]}?`))return;save.disabled=true;
          try{await api('/'+item.id,'PATCH',{revision:item.revision,status:select.value,message:input.value});message('Decisão salva. O cliente pode consultá-la na conta.');await load();}
          catch(error){message(error.message,true);save.disabled=false;}});article.append(form);
      }
      if(item.status==='pending'){
        article.append(text('p',`Aviso por e-mail: ${{pending:'pendente',sending:'em processamento',sent:'aceito pelo SMTP',failed:'falhou'}[item.notification_state]||'indisponível'} · Tentativas: ${item.notification_attempts}`));
        if(['pending','failed','sending'].includes(item.notification_state)&&item.notification_attempts<5){
          const retry=text('button','Tentar enviar aviso');retry.type='button';retry.className='text-link';
          retry.addEventListener('click',async()=>{retry.disabled=true;try{const result=await api('/'+item.id+'/notify','POST',{});message(result.state==='sent'?'Aviso aceito pelo servidor de e-mail.':result.state==='failed'?'O envio falhou.':'Envio não executado. Confira configuração ou aguarde a tentativa em andamento.',result.state!=='sent');await load();}catch(error){message(error.message,true);retry.disabled=false;}});article.append(retry);
        }
      }
      const history=document.createElement('details');history.append(text('summary','Histórico de decisões'));
      for(const event of item.staff_history||[])history.append(text('p',`${new Date(event.at).toLocaleString('pt-BR')} · ${labels[event.from]} → ${labels[event.to]} · ${event.message}`));
      article.append(history);list.append(article);
    }
    prev.disabled=page===1;next.disabled=!result.hasMore;document.querySelector('#staff-page').textContent=`Página ${page}`;
  }catch(error){if(current===generation)list.textContent=error.message||'Falha de conexão. Tente atualizar.';}
  finally{if(current===generation)list.setAttribute('aria-busy','false');}
}
filter.addEventListener('change',()=>{page=1;load();});document.querySelector('#staff-refresh').addEventListener('click',load);
prev.addEventListener('click',()=>{page--;load();});next.addEventListener('click',()=>{page++;load();});load();
