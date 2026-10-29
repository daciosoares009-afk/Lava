import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
let supabaseClient;
let activeBackend;
const boundedFetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
export async function connectDatabase(configOrUri) {
  const config = typeof configOrUri === 'string' ? { backend: 'mongo', mongoUri: configOrUri } : configOrUri;
  if (!config || !['mongo', 'supabase'].includes(config.backend)) throw new Error('Backend de banco inválido.');
  if (activeBackend && activeBackend !== config.backend) throw new Error('Desconecte o banco antes de trocar de backend.');
  if (config.backend === 'mongo') {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 5 });
    const { MongooseUser } = await import('./models/User.js');
    await MongooseUser.init();
    const { initializeSecurityIndexes } = await import('./securityStore.js');
    await initializeSecurityIndexes();
    activeBackend = 'mongo';
    return mongoose.connection;
  }
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) throw new Error('Configuração Supabase incompleta.');
  const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: boundedFetch },
  });
  const { data, error } = await client.rpc('lavemais_health');
  if (error || data !== 1) throw Object.assign(new Error('Esquema Supabase indisponível ou desatualizado.'), { code: error?.code || 'DATABASE_UNAVAILABLE' });
  supabaseClient = client;
  activeBackend = 'supabase';
  return client;
}
export function getDatabaseBackend() { return activeBackend; }
export function getSupabaseClient() {
  if (!supabaseClient || activeBackend !== 'supabase') throw new Error('Supabase ainda não foi inicializado.');
  return supabaseClient;
}
export function databaseReady() {
  return activeBackend === 'supabase' ? Boolean(supabaseClient) : activeBackend === 'mongo' && mongoose.connection.readyState === 1;
}
export async function checkDatabaseHealth() {
  if (!databaseReady()) return false;
  try {
    if (activeBackend === 'mongo') await mongoose.connection.db.admin().ping();
    else { const { data, error } = await supabaseClient.rpc('lavemais_health'); if (error || data !== 1) return false; }
    return true;
  } catch { return false; }
}
export async function disconnectDatabase() {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  activeBackend = undefined;
  supabaseClient = undefined;
}
