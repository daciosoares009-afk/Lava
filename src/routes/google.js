import { Router } from 'express';
import { randomBytes,createHash,randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { verifyGoogleToken,pendingGoogle,googlePendingCookie } from '../googleAuth.js';
import { users } from '../users.js';
import { mfaStore } from '../mfaStore.js';
import { persistentLimit } from '../securityStore.js';
import { databaseReady } from '../db.js';
import { issueSession } from '../authSession.js';
const router=Router(),stateCookie='lavemais_google_state';
const options=config=>({path:'/api/auth/google',httpOnly:true,secure:config.nodeEnv==='production',sameSite:'lax'});
router.get('/pending',(req,res)=>{
  const pending=pendingGoogle(req);
  return res.json(pending?pending.kind==='mfa'?{mfaRequired:true,challenge:pending.challenge}:{pending:true,email:pending.email,name:pending.name}:{pending:false});
});
router.use((req,res,next)=>{
  const config=req.app.locals.config;
  if(!config.googleClientId||!config.googleClientSecret||!config.appBaseUrl)return res.redirect(302,'/login?google=unavailable');
  if(!databaseReady())return res.status(503).send('Login temporariamente indisponível.');
  return next();
});
router.use(persistentLimit('google-auth',15*60000,20));
router.get('/',(req,res)=>{
  const config=req.app.locals.config,state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const signed=jwt.sign({state,nonce,verifier},config.jwtSecret,{issuer:'lavemais-api',audience:'google-state',expiresIn:'10m'});
  res.cookie(stateCookie,signed,{...options(config),maxAge:600000});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:config.googleClientId,redirect_uri:config.appBaseUrl+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'});
  return res.redirect(302,url.href);
});
router.get('/callback',async(req,res)=>{
  const config=req.app.locals.config;
  res.clearCookie(stateCookie,options(config));
  try{
    const state=jwt.verify(req.cookies?.[stateCookie],config.jwtSecret,{algorithms:['HS256'],issuer:'lavemais-api',audience:'google-state'});
    if(typeof req.query.state!=='string'||req.query.state!==state.state||typeof req.query.code!=='string'||req.query.code.length>4096||req.query.error)throw new Error('Invalid OAuth return');
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:req.query.code,client_id:config.googleClientId,client_secret:config.googleClientSecret,redirect_uri:config.appBaseUrl+'/api/auth/google/callback',grant_type:'authorization_code',code_verifier:state.verifier}),signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('OAuth exchange failed');
    const identity=await verifyGoogleToken((await response.json()).id_token,config,state.nonce);
    const user=await users.findByGoogleSubject(identity.sub);
    let pending;
    if(user){
      const credential=await mfaStore.get(String(user.id));
      if(!credential?.enabled){issueSession(res,user,config.jwtSecret,config.nodeEnv);return res.redirect(302,'/conta');}
      const challenge=jwt.sign({sub:String(user.id),sv:user.sessionVersion||0,version:credential.version},config.jwtSecret,{jwtid:randomUUID(),issuer:'lavemais-api',audience:'lavemais-mfa',expiresIn:'5m'});
      pending={kind:'mfa',challenge};
    }else pending={kind:'identity',sub:identity.sub,email:identity.email.trim().toLowerCase(),name:typeof identity.name==='string'?identity.name.slice(0,120):''};
    res.cookie(googlePendingCookie,jwt.sign(pending,config.jwtSecret,{issuer:'lavemais-api',audience:'google-pending',expiresIn:'5m'}),{path:'/api/auth',httpOnly:true,secure:config.nodeEnv==='production',sameSite:'strict',maxAge:300000});
    return res.redirect(302,'/login?google=continue');
  }catch{return res.redirect(302,'/login?google=failed');}
});
export default router;
