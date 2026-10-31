import dotenv from 'dotenv';
import { isIP } from 'node:net';
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
  const proxyValue = env.TRUST_PROXY?.trim();
  const trustProxy = !proxyValue || proxyValue === 'false' ? false : proxyValue.split(',').map(value => value.trim());
  if (trustProxy && trustProxy.some(value => {
    const [ip, prefix, extra] = value.split('/');
    const family = isIP(ip);
    return !family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)));
  })) invalid('TRUST_PROXY deve listar IPs/CIDRs confiáveis; true e número de saltos não são permitidos.');
  const staffUserIds = (env.STAFF_USER_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (staffUserIds.some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))) invalid('STAFF_USER_IDS deve conter UUIDs das contas autorizadas.');
  const staffNotificationEmail = (env.STAFF_NOTIFICATION_EMAIL || '').trim();
  if (staffNotificationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffNotificationEmail)) invalid('STAFF_NOTIFICATION_EMAIL inválido.');
  let appBaseUrl = '';
  if (env.APP_BASE_URL) {
    try { const url = new URL(env.APP_BASE_URL); if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || (nodeEnv !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error(); appBaseUrl = url.origin; }
    catch { invalid('APP_BASE_URL precisa ser uma origem HTTPS (ou localhost em desenvolvimento).'); }
  }
  if (staffUserIds.length && backend !== 'supabase') invalid('O painel da equipe exige Supabase nesta versão.');
  if (staffNotificationEmail && (!smtp.configured || !appBaseUrl || backend !== 'supabase')) invalid('Avisos da equipe exigem Supabase, SMTP e APP_BASE_URL.');
  const mfaEncryptionKey = env.MFA_ENCRYPTION_KEY || '';
  if (mfaEncryptionKey && !/^[a-f0-9]{64}$/i.test(mfaEncryptionKey)) invalid('MFA_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais aleatórios.');
  const requireStaffMfa = env.REQUIRE_STAFF_MFA === 'true';
  if (env.REQUIRE_STAFF_MFA && !['true','false'].includes(env.REQUIRE_STAFF_MFA)) invalid('REQUIRE_STAFF_MFA deve ser true ou false.');
  if (requireStaffMfa && !mfaEncryptionKey) invalid('MFA_ENCRYPTION_KEY é obrigatória quando REQUIRE_STAFF_MFA=true.');
  return { requireStaffMfa, mfaEncryptionKey, port, backend, jwtSecret, mongoUri, supabaseUrl, supabaseServiceRoleKey, nodeEnv, smtp, trustProxy, vercelDeployment: deployed, staffUserIds, staffNotificationEmail, appBaseUrl };
}
