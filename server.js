import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { readConfig } from './src/config.js';
import { connectDatabase, databaseReady, checkDatabaseHealth } from './src/db.js';
import { formatSafeError } from './src/safeError.js';
import authRouter from './src/routes/auth.js';
import clientRouter from './src/routes/client.js';
import { getSessionUser } from './src/authSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
let config;
let databaseConnectionPromise;
const isVercelDeployment = process.env.VERCEL === '1'
  || process.env.VERCEL_ENV === 'preview'
  || process.env.VERCEL_ENV === 'production';

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'style-src': ["'self'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:'],
    },
  },
}));
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/conta') || req.path === '/login') res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.locals.config = {};

async function ensureVercelDatabase() {
  if (!config) {
    config = readConfig();
    app.locals.config = config;
    app.set('trust proxy', config.trustProxy); 
  }
  if (databaseReady()) return;
  if (!databaseConnectionPromise) {
    const pending = connectDatabase(config);
    databaseConnectionPromise = pending;
    try {
      await pending;
    } finally {
      if (databaseConnectionPromise === pending) databaseConnectionPromise = undefined;
    }
    return;
  }
  await databaseConnectionPromise;
}

function initializeVercelDatabase(req, res, next) {
  if (!isVercelDeployment && process.env.NODE_ENV !== 'production') return next();
  if (!config) app.locals.config = { nodeEnv: 'production' };
  if (req.method === 'POST' && req.path === '/api/auth/logout' && !req.cookies?.lavemais_session) return next();
  const needsDatabase = req.path.startsWith('/conta')
    || req.path.startsWith('/api/') || (req.path === '/login' && req.cookies?.lavemais_session);
  if (!needsDatabase) return next();

  ensureVercelDatabase().then(() => next()).catch((error) => {
    console.error('Vercel request initialization failed:', formatSafeError(error));
    if (req.path === '/api/health') {
      return res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
    if (req.path.startsWith('/conta')) {
      return res.status(503).send('Sua conta está temporariamente indisponível. Tente novamente em instantes.');
    }
    const configError = error?.code === 'INVALID_CONFIG';
    return res.status(503).json({ error: {
      code: configError ? 'SERVICE_CONFIG_INVALID' : 'DATABASE_UNAVAILABLE',
      message: configError ? 'O serviço está temporariamente indisponível.' : 'O serviço de cadastro e login está temporariamente indisponível.',
    } });
  });
}

app.use(initializeVercelDatabase);

app.get('/api/health', async (_req, res) => {
  const ready = await checkDatabaseHealth();
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable', database: ready ? 'connected' : 'disconnected' });
});
app.use('/api/auth', authRouter);
app.use('/api/client', clientRouter);
app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/login', async (req, res, next) => {
  try {
    const session = await getSessionUser(req, res);
    if (session.user) return res.redirect(302, safeAccountPath(req.query.next));
    return res.sendFile(path.join(__dirname, 'index.html'));
  } catch (error) { return next(error); }
});
app.get(['/recuperar-senha', '/recuperar-senha.html'], (_req, res) => res.sendFile(path.join(__dirname, 'recuperar-senha.html')));
const accountSections = new Set(['inicio', 'agendamentos', 'servicos', 'planos', 'beneficios', 'perfil', 'sobre']);
function safeAccountPath(value) {
  if (value === '/conta') return value;
  const match = typeof value === 'string' && value.match(/^\/conta\/([a-z-]+)$/);
  return match && accountSections.has(match[1]) ? value : '/conta';
}

app.get(['/conta', '/conta/:section'], async (req, res, next) => {
  try {
    const section = req.params.section || 'inicio';
    if (!accountSections.has(section)) return res.status(404).send('Página da conta não encontrada.');
    const session = await getSessionUser(req, res);
    if (session.user) return res.sendFile(path.join(__dirname, 'dashboard.html'));
    if (session.error === 'DATABASE_UNAVAILABLE') return res.status(503).send('Sua conta está temporariamente indisponível. Tente novamente em instantes.');
    return res.redirect(302, `/login?next=${encodeURIComponent(req.path)}`);
  } catch (error) { return next(error); }
});
app.get('/cadastro', (_req, res) => res.redirect(302, '/login#cadastro'));
app.use(express.static(path.join(__dirname, 'public'), { index: false, dotfiles: 'deny' }));
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }));
app.use((_req, res) => res.status(404).send('Página não encontrada.'));
app.use((error, req, res, next) => {
  console.error('Request failed:', req.method, req.path, formatSafeError(error));
  if (res.headersSent) return next(error);
  let status = 500, code = 'INTERNAL_ERROR', message = 'Não foi possível concluir a solicitação.';
  if (error?.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'O conteúdo enviado não é um JSON válido.'; }
  else if (error?.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'O conteúdo enviado excede o limite permitido.'; }
  else if (['ValidationError', 'CastError'].includes(error?.name) || ['23514', '22007', '22008', '22P02'].includes(error?.code)) { status = 400; code = 'VALIDATION_ERROR'; message = 'Confira os dados informados.'; }
  else if (error?.status >= 400 && error?.status < 500) { status = error.status; code = 'INVALID_REQUEST'; message = 'Solicitação inválida.'; }
  else if (/Mongo.*(Network|Selection|Timeout)|MongooseServerSelectionError/.test(error?.name || '') || ['PGRST000', 'PGRST001', 'PGRST002', 'PGRST202', '42501', '42P01', 'ECONNREFUSED', 'ENOTFOUND', 'DATABASE_UNAVAILABLE'].includes(error?.code) || error?.message?.includes('fetch failed')) { status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'O serviço está temporariamente indisponível.'; }
  return res.status(status).json({ error: { code, message } });
});

async function start() {
  try {
    config = readConfig();
    app.locals.config = config;
    app.set('trust proxy', config.trustProxy);
    await connectDatabase(config);
    const backendName = config.backend === 'supabase' ? 'Supabase' : 'MongoDB';
    app.listen(config.port, '0.0.0.0', () => console.log(`LaveMais disponível na porta ${config.port} (${backendName} conectado).`));
  } catch (error) {
    if (error.code === 'INVALID_CONFIG') console.error(`Não foi possível iniciar a LaveMais: ${error.message}`);
    else console.error(`Não foi possível conectar ao MongoDB ou iniciar o servidor: ${formatSafeError(error)}`);
    process.exitCode = 1;
  }
}

if (!isVercelDeployment && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await start();

export { app, start };
export default app;
