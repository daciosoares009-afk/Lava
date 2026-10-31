import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';
let cachedKeys, expiresAt=0;
export async function verifyGoogleToken(token,config,nonce) {
  const decoded=jwt.decode(token,{complete:true});
  if(decoded?.header.alg!=='RS256'||typeof decoded.header.kid!=='string')throw new Error('Invalid Google identity');
  if(!cachedKeys||Date.now()>=expiresAt){
    const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('Google keys unavailable');
    cachedKeys=(await response.json()).keys;expiresAt=Date.now()+300000;
  }
  const key=cachedKeys?.find(key=>key.kid===decoded.header.kid);
  if(!key)throw new Error('Invalid Google signing key');
  const claims=jwt.verify(token,createPublicKey({key,format:'jwk'}),{algorithms:['RS256'],issuer:['https://accounts.google.com','accounts.google.com'],audience:config.googleClientId,maxAge:'10m'});
  if(claims.nonce!==nonce||claims.email_verified!==true||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||typeof claims.email!=='string'||claims.email.length>254)throw new Error('Unverified Google identity');
  return claims;
}
export const googlePendingCookie='lavemais_google_pending';
export function pendingGoogle(req) {
  try{return jwt.verify(req.cookies?.[googlePendingCookie],req.app.locals.config.jwtSecret,{algorithms:['HS256'],issuer:'lavemais-api',audience:'google-pending'});}catch{return null;}
}
export function clearGooglePending(res,config){res.clearCookie(googlePendingCookie,{path:'/api/auth',httpOnly:true,secure:config.nodeEnv==='production',sameSite:'strict'});}
