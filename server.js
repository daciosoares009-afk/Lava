import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { readConfig } from './src/config.js';
import { connectDatabase, databaseReady } from './src/db.js';
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
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.locals.config = {};

async function ensureVercelDatabase() {
  if (!config) {
    config = readConfig();
    app.locals.config = config;
  }
  if (databaseReady()) return;
  if (!databaseConnectionPromise) {
    const pending = connectDatabase(config.mongoUri);
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
  if (req.method === 'POST' && req.path === '/api/auth/logout') return next();
  const needsDatabase = req.path.startsWith('/conta')
    || req.path.startsWith('/api/');
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

app.get('/api/health', (_req, res) => {
  const ready = databaseReady();
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
app.get('/styles.css', (_req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/logo-lavemais.png', (_req, res) => res.sendFile(path.join(__dirname, 'logo-lavemais.png')));
app.get('/lavemais-hero.jpg', (_req, res) => res.sendFile(path.join(__dirname, 'lavemais-hero.jpg')));
app.get('/home.css', (_req, res) => res.sendFile(path.join(__dirname, 'home.css')));
app.get('/home.js', (_req, res) => res.sendFile(path.join(__dirname, 'home.js')));
app.get('/site-content.js', (_req, res) => res.sendFile(path.join(__dirname, 'site-content.js')));
app.get('/dashboard.css', (_req, res) => res.sendFile(path.join(__dirname, 'dashboard.css')));
app.get('/dashboard.js', (_req, res) => res.sendFile(path.join(__dirname, 'dashboard.js')));
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }));
app.use((_req, res) => res.status(404).send('Página não encontrada.'));
app.use((error, _req, res, _next) => {
  console.error('Request failed:', error?.name || 'Error');
  if (res.headersSent) return;
  const status = error?.type === 'entity.parse.failed' ? 400 : 500;
  return res.status(status).json({ error: { code: status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR', message: status === 400 ? 'O conteúdo enviado não é um JSON válido.' : 'Não foi possível concluir a solicitação.' } });
});

async function start() {
  try {
    config = readConfig();
    app.locals.config = config;
    await connectDatabase(config.mongoUri);
    app.listen(config.port, '0.0.0.0', () => console.log(`LaveMais disponível na porta ${config.port} (MongoDB conectado).`));
  } catch (error) {
    if (error.code === 'INVALID_CONFIG') console.error(`Não foi possível iniciar a LaveMais: ${error.message}`);
    else console.error(`Não foi possível conectar ao MongoDB ou iniciar o servidor: ${formatSafeError(error)}`);
    process.exitCode = 1;
  }
}

if (!isVercelDeployment && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await start();

export { app, start };
export default app;
