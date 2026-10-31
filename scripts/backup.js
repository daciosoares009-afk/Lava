// Explicit backup credentials only. Never imports .env or application configuration.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, appendFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import { backupCipher } from './backup-crypto.js';
let directory, destination;
try {
  const required=['BACKUP_DATABASE_URL','BACKUP_ENCRYPTION_KEY','BACKUP_S3_BUCKET','BACKUP_KMS_KEY_ID','BACKUP_CA_FILE'];
  if(required.some(key=>!process.env[key]))throw new Error('Missing backup configuration');
  if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(process.env.BACKUP_S3_BUCKET))throw new Error('Invalid backup destination');
  const db=new URL(process.env.BACKUP_DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(db.protocol))throw new Error('Expected PostgreSQL backup source');
  const env={...process.env,PGHOST:db.hostname,PGPORT:db.port||'5432',PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:decodeURIComponent(db.pathname.slice(1)),PGSSLMODE:'verify-full',PGSSLROOTCERT:process.env.BACKUP_CA_FILE,PGCONNECT_TIMEOUT:'10'};
  directory=await mkdtemp(path.join(tmpdir(),'lavemais-backup-'));destination=path.join(directory,'database.dump.enc');
  const {cipher,header}=backupCipher(process.env.BACKUP_ENCRYPTION_KEY);
  const output=createWriteStream(destination,{flags:'wx',mode:0o600});output.write(header);
  const dump=spawn('pg_dump',['--format=custom','--no-owner','--no-acl','--schema=public'],{env,stdio:['ignore','pipe','ignore']});
  const closed=once(dump,'close');
  try { const [code]=await Promise.all([closed,pipeline(dump.stdout,cipher,output)]).then(results=>results[0]);if(code!==0)throw new Error('Database dump failed'); }
  catch(error){dump.kill();throw error;}
  await appendFile(destination,cipher.getAuthTag());
  const object='lavemais/'+new Date().toISOString().replaceAll(':','-')+'.dump.enc';
  const upload=spawn('aws',['s3','cp',destination,`s3://${process.env.BACKUP_S3_BUCKET}/${object}`,'--sse','aws:kms','--sse-kms-key-id',process.env.BACKUP_KMS_KEY_ID,'--only-show-errors'],{stdio:'ignore'});
  const [status]=await once(upload,'close');if(status!==0)throw new Error('Isolated backup upload failed');
  console.log('Encrypted backup uploaded successfully. Restore verification is a separate required step.');
} catch {console.error('Backup failed. Check configuration, database client version, permissions and connectivity; no secrets were logged.');process.exitCode=1;}
finally {if(destination)await unlink(destination).catch(()=>{});if(directory)await rmdir(directory).catch(()=>{});}
