import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
if (!process.env.NODE_TEST_CONTEXT) dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
function invalid(message) {
  throw Object.assign(new Error(`Configuração ausente ou inválida: ${message}`), { code: 'INVALID_CONFIG' });
}
export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid('PORT precisa estar entre 1 e 65535.');
  const jwtSecret = env.JWT_SECRET || '';
  const supabaseUrl = (env.SUPABASE_URL || '').trim();
  const supabaseServiceRoleKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const mongoUri = (env.MONGODB_URI || '').trim();
  const hasSupabase = Boolean(supabaseUrl || supabaseServiceRoleKey || env.SUPABASE_ANON_KEY);
  let backend = env.DATABASE_BACKEND?.trim();
  if (!backend) {
    if (hasSupabase && mongoUri) invalid('Defina DATABASE_BACKEND=mongo ou supabase quando ambos estiverem configurados.');
    backend = hasSupabase ? 'supabase' : 'mongo';
  }
  if (!['mongo', 'supabase'].includes(backend)) invalid('DATABASE_BACKEND deve ser mongo ou supabase.');
  const missing = [];
  if (backend === 'mongo' && !/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(mongoUri)) missing.push('MONGODB_URI');
  if (backend === 'supabase') {
    try { if (new URL(supabaseUrl).protocol !== 'https:') throw new Error(); }
    catch { missing.push('SUPABASE_URL HTTPS válida'); }
    if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY (somente no servidor)');
  }
  if (jwtSecret.length < 32 || /gere-um-segredo|change.?me|replace.?me/i.test(jwtSecret)) missing.push('JWT_SECRET (mínimo de 32 caracteres aleatórios)');
  if (missing.length) invalid(missing.join(', '));
  const deployed = env.VERCEL === '1' || ['preview', 'production'].includes(env.VERCEL_ENV);
  const nodeEnv = deployed ? 'production' : (env.NODE_ENV || 'development');
  const smtp = { host: env.SMTP_HOST?.trim() || '', port: Number(env.SMTP_PORT || 587), user: env.SMTP_USER?.trim() || '', password: env.SMTP_PASSWORD || '', from: env.SMTP_FROM?.trim() || '' };
  smtp.configured = Boolean(smtp.host && smtp.user && smtp.password && smtp.from);
  if (smtp.configured && ![465, 587].includes(smtp.port)) invalid('SMTP_PORT deve ser 465 ou 587.');
  if ([smtp.host, smtp.user, smtp.password, smtp.from].some(Boolean) && !smtp.configured) invalid('Preencha todas as variáveis SMTP ou deixe todas vazias.');
  const trustProxy = env.TRUST_PROXY?.trim() || false;
  if (trustProxy === 'true' || /^\d+$/.test(trustProxy || '')) invalid('TRUST_PROXY deve listar IPs/sub-redes confiáveis, nunca true ou número de saltos.');
  return { port, backend, jwtSecret, mongoUri, supabaseUrl, supabaseServiceRoleKey, nodeEnv, smtp, trustProxy };
}
