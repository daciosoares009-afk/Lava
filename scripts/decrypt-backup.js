// Decrypt to a NEW local file only; never restores a database automatically.
import { open, unlink, rename } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { backupDecipher } from './backup-crypto.js';
const [source,destination]=process.argv.slice(2);
let partial;
try {
  if(!source||!destination)throw new Error('Specify source and new destination');
  const file=await open(source,'r');
  let header,tag,size;
  try {size=(await file.stat()).size;if(size<35)throw new Error('Invalid backup');header=Buffer.alloc(19);tag=Buffer.alloc(16);await file.read(header,0,19,0);await file.read(tag,0,16,size-16);}
  finally {await file.close();}
  const decipher=backupDecipher(header,tag,process.env.BACKUP_ENCRYPTION_KEY);
  partial=destination+'.'+randomUUID()+'.partial';
  await pipeline(createReadStream(source,{start:19,end:size-17}),decipher,createWriteStream(partial,{flags:'wx',mode:0o600}));
  // Copy with exclusive creation to prevent overwriting an existing file.
  const {copyFile,constants}=await import('node:fs/promises');
  await copyFile(partial,destination,constants.COPYFILE_EXCL);await unlink(partial);partial=undefined;
  console.log('Backup authenticated and decrypted. Restore only into a dedicated isolated database.');
} catch {console.error('Decryption failed; existing output was not overwritten. Check file, key and permissions.');process.exitCode=1;}
finally{if(partial)await unlink(partial).catch(()=>{});}
