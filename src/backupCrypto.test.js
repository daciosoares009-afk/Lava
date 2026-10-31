import test from 'node:test';
import assert from 'node:assert/strict';
import { backupCipher,backupDecipher } from '../scripts/backup-crypto.js';

test('backup cifra e autentica conteúdo, chave e formato',()=>{
  const key='ab'.repeat(32),plain=Buffer.from('synthetic database fixture');
  const {cipher,header}=backupCipher(key);
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
  assert.equal(encrypted.includes(plain),false);
  const decipher=backupDecipher(header,tag,key);
  assert.deepEqual(Buffer.concat([decipher.update(encrypted),decipher.final()]),plain);
  const altered=Buffer.from(encrypted);altered[0]^=1;
  const invalid=backupDecipher(header,tag,key);invalid.update(altered);assert.throws(()=>invalid.final());
  assert.throws(()=>backupCipher('weak'));
});

import { mkdtemp,writeFile,readFile,unlink,rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('restauração local autentica arquivo e não sobrescreve destino existente',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'lavemais-restore-test-'));
  try {
    const key='cd'.repeat(32),{cipher,header}=backupCipher(key),plain=Buffer.from('isolated fixture');
    const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
    const source=path.join(directory,'fixture.enc'),output=path.join(directory,'restored.dump');
    await writeFile(source,Buffer.concat([header,encrypted,cipher.getAuthTag()]));
    const env={...process.env,BACKUP_ENCRYPTION_KEY:key};
    execFileSync(process.execPath,['scripts/decrypt-backup.js',source,output],{env,stdio:'pipe'});
    assert.deepEqual(await readFile(output),plain);
    assert.throws(()=>execFileSync(process.execPath,['scripts/decrypt-backup.js',source,output],{env,stdio:'pipe'}));
    assert.deepEqual(await readFile(output),plain);
  }finally{await unlink(path.join(directory,'fixture.enc')).catch(()=>{});await unlink(path.join(directory,'restored.dump')).catch(()=>{});await rmdir(directory);}
});
