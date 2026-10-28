import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;
let activeBackend = null;

async function connectMongoDatabase(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await mongoose.model('User').init();
  activeBackend = 'mongo';
}

async function connectSupabaseDatabase({ url, key }) {
  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  activeBackend = 'supabase';
}

export async function connectDatabase(configOrUri) {
  if (!configOrUri) {
    throw new Error('Nenhuma configuração de banco informada.');
  }

  if (typeof configOrUri === 'object') {
    if (configOrUri.supabaseUrl && (configOrUri.supabaseServiceRoleKey || configOrUri.supabaseAnonKey)) {
      await connectSupabaseDatabase({
        url: configOrUri.supabaseUrl,
        key: configOrUri.supabaseServiceRoleKey || configOrUri.supabaseAnonKey,
      });
      return supabaseClient;
    }
    if (configOrUri.mongoUri) {
      await connectMongoDatabase(configOrUri.mongoUri);
      return mongoose.connection;
    }
  }

  const uri = String(configOrUri).trim();
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    await connectSupabaseDatabase({
      url: uri,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    });
    return supabaseClient;
  }

  await connectMongoDatabase(uri);
  return mongoose.connection;
}

export function getDatabaseBackend() {
  return activeBackend;
}

export function getSupabaseClient() {
  if (!supabaseClient) {
    throw new Error('Supabase ainda não foi inicializado.');
  }
  return supabaseClient;
}

export function databaseReady() {
  return (activeBackend === 'supabase' && Boolean(supabaseClient))
    || (activeBackend === 'mongo' && mongoose.connection.readyState === 1)
    || (!activeBackend && Boolean(process.env.SUPABASE_URL));
}
