import { DatabaseSync } from 'node:sqlite';
import { openSync, closeSync, lstatSync, constants } from 'node:fs';
import { join } from 'node:path';
import { privateDirectory } from './config.mjs';

/** Cross-location/process ownership, released by the OS on crash. No stale reset. */
export async function withNativeLock(directory, name, action) {
  if (!['host-anchor','setup'].includes(name)) throw new Error('native_lock_invalid');
  const path=join(privateDirectory(directory),`v2-${name}-owner.sqlite`);
  try { const fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);closeSync(fd); }
  catch(error){if(error.code!=='EEXIST')throw error;}
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.mode&0o077||process.getuid&&stat.uid!==process.getuid())throw new Error('native_lock_invalid');
  let db;
  try{db=new DatabaseSync(path);db.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner(id INTEGER)');return await action();}
  finally{db?.close();}
}
