import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { MongooseUser } from '../src/models/User.js';
import { validateProfileUpdate, } from '../src/profileValidation.js';
import { normalizeEmail, validatePasswordResetRequest } from '../src/authValidation.js';

dotenv.config();
const apply = process.argv.includes('--apply');
const sourceUri = process.env.MONGODB_MIGRATION_URI;
if (!sourceUri || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina MONGODB_MIGRATION_URI, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Por padrão apenas valida; --apply insere novos usuários.');
  process.exit(1);
}
const destination = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(url,init={})=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}});
const uuidFor = id => {
  const hex=createHash('sha256').update(`lavemais:mongo-user:${id}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
try {
  await mongoose.connect(sourceUri,{serverSelectionTimeoutMS:5000,maxPoolSize:2});
  const health=await destination.rpc('lavemais_health'); if(health.error) throw new Error('Aplique o schema.sql no destino antes da migração.');
  // Validate the complete source and reconcile destination before making any write.
  const pending=[], seen=new Set();let existing=0;
  for await (const row of MongooseUser.find().select('+passwordHash').cursor()) {
    const email=normalizeEmail(row.email);
    const birthDate=row.birthDate?.toISOString().slice(0,10);
    const {errors}=validateProfileUpdate({fullName:row.fullName,phone:row.phone,birthDate});
    if(Object.keys(errors).length || Object.keys(validatePasswordResetRequest({email}).errors).length || seen.has(email) || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(row.passwordHash || '')) throw new Error('Origem contém registros inválidos ou e-mails duplicados. Nenhuma nova escrita será iniciada nesta execução.');
    seen.add(email);
    const {data,error}=await destination.from('users').select('id,legacy_mongo_id,full_name,email,phone,birth_date,password_hash,created_at').eq('email',email).maybeSingle();
    if(error) throw new Error('Não foi possível reconciliar o destino.');
    const record={id:uuidFor(String(row._id)),legacy_mongo_id:String(row._id),full_name:row.fullName,email,phone:row.phone,birth_date:birthDate,password_hash:row.passwordHash,created_at:row.createdAt.toISOString(),updated_at:row.updatedAt.toISOString(),session_version:0};
    if(data) {
      if(data.legacy_mongo_id!==record.legacy_mongo_id || ['full_name','phone','birth_date','password_hash'].some(key=>data[key]!==record[key])) throw new Error('Conflito no destino; reconcilie manualmente antes de continuar. Nenhum registro existente será sobrescrito.');
      existing++;continue;
    }
    pending.push(record);
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',source:seen.size,alreadyMigrated:existing,pending:pending.length}));
  if(apply) {
    // No upsert: an unexpected destination change fails instead of overwriting customers.
    for(const row of pending) {const {error}=await destination.from('users').insert(row);if(error) throw new Error('Importação interrompida. Registros já inseridos são preservados; faça nova validação antes de retomar.');}
    console.log(`Migração concluída: ${pending.length} usuários inseridos. Execute novamente sem --apply para reconciliar.`);
  }
} catch(error) { console.error(error.message.startsWith('Origem') || error.message.startsWith('Conflito') || error.message.startsWith('Importação') || error.message.startsWith('Aplique') ? error.message : 'Falha na validação/migração. Verifique acesso e esquema sem divulgar credenciais.');process.exitCode=1; }
finally {await mongoose.disconnect();}
