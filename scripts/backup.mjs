import 'dotenv/config';
import path from 'node:path';
import {createBackup,verifyBackup,restoreBackup} from './data-safety.mjs';
const args=process.argv.slice(2),value=key=>args.find(a=>a.startsWith(key+'='))?.slice(key.length+1),mode=args[0]||'create';
try{
 const pgOptions={docker:args.includes('--docker'),container:process.env.BACKUP_PG_CONTAINER,pgBin:process.env.PG_BIN},common={pgOptions,appStopped:args.includes('--app-stopped'),onProgress:message=>console.log(message)};
 let result;if(mode==='create'){const root=process.cwd();await import('node:fs/promises').then(async({mkdir})=>mkdir(path.join(root,'backups'),{recursive:true}));result=await createBackup({...common,root,connection:process.env.DATABASE_URL,destination:value('--out')});}
 else if(mode==='verify')result={...(await verifyBackup(value('--backup'))),inventory:undefined,files:undefined,verified:true};
 else if(mode==='restore'){if(!process.env.RESTORE_DATABASE_URL)throw Error('Set RESTORE_DATABASE_URL to a separate empty database.');result=await restoreBackup({...common,directory:value('--backup'),connection:process.env.RESTORE_DATABASE_URL,filesTo:value('--files-to')});}
 else throw Error('Commands: create, verify --backup=PATH, restore --backup=PATH --files-to=NEW_PATH');console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
