import { Router } from 'express';
import { requireStaff } from '../staffAccess.js';
import { getSupabaseClient } from '../db.js';
import { persistentLimit } from '../securityStore.js';
import { notifyStaff } from '../staffNotifications.js';
const router = Router();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function isUuid(value) {
  return typeof value === 'string' && value.length === 36 && uuid.test(value);
}
router.use(requireStaff);
router.get('/appointments', async (req,res) => {
  const status = req.query.status || 'pending', page = Number(req.query.page || 1);
  if (!['pending','confirmed','cancelled','completed'].includes(status) || !Number.isInteger(page) || page<1 || page>10000) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Filtro inválido.'}});
  const db=getSupabaseClient();
  const {data,error}=await db.from('appointment_requests').select('id,user_id,service,preferred_date,notes,status,revision,staff_message,staff_history,notification_state,notification_attempts,created_at').eq('status',status)
    .order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*20,(page-1)*20+20);
  if(error)throw error;
  const rows = await Promise.all(data.slice(0,20).map(async row=>{
    const {data:user,error:userError}=await db.from('users').select('full_name,phone').eq('id',row.user_id).maybeSingle();
    if(userError)throw userError;
    const {user_id,...item}=row;
    return {...item,customer:user};
  }));
  return res.json({appointments:rows,page,hasMore:data.length>20});
});
router.use(persistentLimit('staff-write',60*60_000,120));
router.patch('/appointments/:id',async(req,res)=>{
  const body=req.body;
  if(!isUuid(req.params.id)||!body||!Number.isSafeInteger(body.revision)||body.revision<0||!['confirmed','cancelled','completed'].includes(body.status)||typeof body.message!=='string'||body.message.trim().length<3||body.message.trim().length>500||Object.keys(body).some(k=>!['revision','status','message'].includes(k))) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Informe a situação, a versão e uma orientação de 3 a 500 caracteres.'}});
  const {data,error}=await getSupabaseClient().rpc('lavemais_staff_transition',{p_id:req.params.id,p_revision:body.revision,p_status:body.status,p_message:body.message.trim(),p_actor:req.authenticatedUser.id});
  if(error)throw error;
  if(!data.length)return res.status(409).json({error:{code:'APPOINTMENT_CONFLICT',message:'Registro alterado ou transição não permitida. Atualize a lista.'}});
  return res.json({saved:true});
});
router.post('/appointments/:id/notify',async(req,res)=>{
  if(!isUuid(req.params.id))return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Registro inválido.'}});
  return res.json(await notifyStaff(req.params.id,req.app.locals.config));
});
export default router;
