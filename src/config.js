import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
dotenv.config({ path: envFile });

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT precisa ser um número entre 1 e 65535.');
  }
  const jwtSecret = env.JWT_SECRET || '';
  const supabaseUrl = (env.SUPABASE_URL || '').trim();
  const supabaseAnonKey = (env.SUPABASE_ANON_KEY || '').trim();
  const supabaseServiceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const mongoUri = (env.MONGODB_URI || '').trim();
  const hasSupabase = Boolean(supabaseUrl && (supabaseAnonKey || supabaseServiceKey));
  const hasMongo = Boolean(mongoUri);
  const missing = [];
  if (!hasSupabase && !hasMongo) missing.push('MONGODB_URI ou SUPABASE_URL');
  if (jwtSecret.length < 32) missing.push('JWT_SECRET (mínimo de 32 caracteres)');
  if (missing.length) {
    const error = new Error(`Configuração ausente ou inválida: ${missing.join(', ')}. Copie .env.example para .env e preencha os valores.`);
    error.code = 'INVALID_CONFIG';
    throw error;
  }
  const smtpPort = Number(env.SMTP_PORT || 587);
  const smtp = {
    host: env.SMTP_HOST?.trim() || '',
    port: smtpPort,
    user: env.SMTP_USER?.trim() || '',
    password: env.SMTP_PASSWORD || '',
    from: env.SMTP_FROM?.trim() || '',
  };
  smtp.configured = Boolean(
    smtp.host && Number.isInteger(smtp.port) && smtp.port > 0 && smtp.port <= 65535
      && smtp.user && smtp.password && smtp.from,
  );
  return {
    port,
    jwtSecret,
    mongoUri,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceKey,
    nodeEnv: env.NODE_ENV || 'development',
    smtp,
  };
}
