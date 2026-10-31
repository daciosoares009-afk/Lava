import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID, createHmac } from 'node:crypto';
import { requireAuth, issueSession } from '../authSession.js';
import { pendingGoogle, clearGooglePending } from '../googleAuth.js';
import { users } from '../users.js';
import { passwordMatches } from '../passwordAuth.js';
import { mfaStore } from '../mfaStore.js';
import { newSecret, encryptSecret, decryptSecret, matchingCounter, recoveryCodes, recoveryHash } from '../mfaCrypto.js';
import { databaseReady } from '../db.js';
import { persistentLimit, incrementBucket } from '../securityStore.js';
const router = Router();
router.use((req,res,next) => databaseReady() ? next() : res.status(503).json({error:{code:'DATABASE_UNAVAILABLE',message:'Serviço temporariamente indisponível.'}}));
router.use(persistentLimit('mfa-ip', 15 * 60000, 20));
const rejected = res => res.status(400).json({error:{code:'INVALID_MFA',message:'Código inválido, já utilizado ou expirado. Tente novamente.'}});
async function accountLimit(req, res, id) {
  const key = createHmac('sha256',req.app.locals.config.jwtSecret).update('mfa-account:'+id).digest('hex');
  const { hits } = await incrementBucket(key, 60 * 60000);
  if (hits <= 15) return true;
  res.set('Retry-After', '3600'); res.status(429).json({error:{code:'RATE_LIMITED',message:'Muitas tentativas. Aguarde antes de tentar novamente.'}}); return false;
}
async function checkCode(id, credential, code, config) {
  if (!credential?.enabled || typeof code !== 'string') return false;
  const normalized = code.trim().toLowerCase();
  const recovery = /^[a-f0-9]{24}$/.test(normalized) ? recoveryHash(normalized) : null;
  const counter = recovery ? null : matchingCounter(decryptSecret(credential.secret, config, id), normalized);
  if (!recovery && counter === null) return false;
  return mfaStore.consume(id, credential.version, counter, recovery);
}
router.post('/login', async (req,res) => {
  const config = req.app.locals.config;
  let claims;
  try { claims = jwt.verify(req.body?.challenge,config.jwtSecret,{algorithms:['HS256'],issuer:'lavemais-api',audience:'lavemais-mfa'}); }
  catch { return rejected(res); }
  if (typeof claims.sub !== 'string') return rejected(res);
  if (!await accountLimit(req,res,claims.sub)) return;
  const user = await users.findById(claims.sub), credential = await mfaStore.get(claims.sub);
  if (!user || (user.sessionVersion || 0) !== claims.sv || credential?.version !== claims.version || !await checkCode(claims.sub,credential,req.body?.code,config)) return rejected(res);
  const identity = pendingGoogle(req);
  if(identity?.kind==='identity' && identity.email===user.email) {
    if(!await users.linkGoogle(user.id,identity.sub)) return res.status(409).json({error:{code:'GOOGLE_LINK_CONFLICT',message:'Esta conta já possui outro acesso Google.'}});
  }
  clearGooglePending(res,config);
  issueSession(res,user,config.jwtSecret,config.nodeEnv,credential.version);
  return res.json({user:{id:user.id,fullName:user.fullName,email:user.email}});
});
router.use(requireAuth);
router.get('/status', async (req,res) => {
  const credential = await mfaStore.get(String(req.authenticatedUser.id));
  return res.json({enabled:Boolean(credential?.enabled),available:Boolean(req.app.locals.config.mfaEncryptionKey),pending:Boolean(credential && !credential.enabled && credential.secret && credential.expiresAt > new Date())});
});
router.use(async (req,res,next) => {
  if (!await accountLimit(req,res,String(req.authenticatedUser.id))) return;
  const user = await users.findForLogin(req.authenticatedUser.email);
  if (typeof req.body?.password !== 'string' || Buffer.byteLength(req.body.password)>72 || !await passwordMatches(user,req.body.password)) return res.status(401).json({error:{code:'INVALID_CREDENTIALS',message:'Confira sua senha atual.'}});
  next();
});
router.post('/setup', async (req,res) => {
  const id = String(req.authenticatedUser.id), secret = newSecret(), version = randomUUID();
  const encrypted = encryptSecret(secret,req.app.locals.config,id);
  if (!await mfaStore.begin(id,encrypted,version)) return res.status(409).json({error:{code:'MFA_ENABLED',message:'O segundo fator já está ativo.'}});
  return res.json({secret,uri:`otpauth://totp/${encodeURIComponent('LaveMais:'+req.authenticatedUser.email)}?secret=${secret}&issuer=LaveMais&algorithm=SHA1&digits=6&period=30`});
});
router.post('/confirm', async (req,res) => {
  const id=String(req.authenticatedUser.id), config=req.app.locals.config, credential=await mfaStore.get(id);
  if (!credential || credential.enabled || credential.expiresAt <= new Date()) return rejected(res);
  const counter=matchingCounter(decryptSecret(credential.secret,config,id),req.body?.code);
  const codes=recoveryCodes();
  if (counter===null || !await mfaStore.activate(id,credential.version,counter,codes.map(recoveryHash))) return rejected(res);
  issueSession(res,req.authenticatedUser,config.jwtSecret,config.nodeEnv,credential.version);
  return res.json({enabled:true,recoveryCodes:codes});
});
router.post('/disable', async (req,res) => {
  const id=String(req.authenticatedUser.id), config=req.app.locals.config, credential=await mfaStore.get(id);
  if (!await checkCode(id,credential,req.body?.code,config) || !await mfaStore.disable(id,credential.version)) return rejected(res);
  const user=await users.findById(id);
  issueSession(res,user,config.jwtSecret,config.nodeEnv);
  return res.json({enabled:false});
});
export default router;
