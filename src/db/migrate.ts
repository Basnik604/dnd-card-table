import {resolve} from 'node:path';
import {sql} from './client.js';
import {migrationFiles,runMigrations,adoptMigrations} from './migrations.mjs';
import {verifyBackup,inventory,inventoryData} from '../../scripts/data-safety.mjs';
const value=key=>process.argv.find(arg=>arg.startsWith(key+'='))?.slice(key.length+1);
try {
 const files=await migrationFiles(resolve('db/migrations')),version=value('--from'),dry=process.argv.includes('--dry-run');
 if(version&&dry)throw Error('Choose adoption or --dry-run, not both.');
 const pending=version?null:await runMigrations(sql,files,{dryRun:true});
 const [existing]=await sql`SELECT to_regclass('public.characters') AS name`;
 if(version||(!dry&&pending.length&&existing.name)){
  const backup=value('--backup');if(!backup||!process.argv.includes('--app-stopped'))throw Error('Before changing an existing database, stop writers and pass --backup=VERIFIED_BACKUP --app-stopped.');
  const manifest=await verifyBackup(backup),options={docker:process.argv.includes('--docker'),container:process.env.BACKUP_PG_CONTAINER,pgBin:process.env.PG_BIN};
  const withoutLedger=rows=>inventoryData(rows).filter(r=>r.name!=='app_migrations');
  if(JSON.stringify(withoutLedger(await inventory(process.env.DATABASE_URL,options)))!==JSON.stringify(withoutLedger(manifest.inventory)))throw Error('Database differs from the backup. Create a fresh backup before migrating.');
 }
 const names=version?await adoptMigrations(sql,files,version):dry?pending:await runMigrations(sql,files);
 console.log(JSON.stringify({mode:version?'adopt':dry?'plan':'migrate',files:names},null,2));
} catch(error) { console.error(error.message);process.exitCode=1; }
finally { await sql.end(); }
