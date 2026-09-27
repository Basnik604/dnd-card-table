import 'dotenv/config';
import postgres from 'postgres';
import {inspectCharacterContent,repairCharacterContent,repairSummary} from '../src/maintenance/character-content.mjs';

const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--apply')) {
  console.error('Проверка: npm.cmd run db:repair:character-content\nВосстановление: npm.cmd run db:repair:character-content -- --apply');process.exitCode=1;
} else if(!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан. Откройте терминал в папке прежнего проекта с вашим .env.');process.exitCode=1;
} else {
  const sql=postgres(process.env.DATABASE_URL,{max:1,onnotice:()=>{}});
  try {
    const state=await inspectCharacterContent(sql);
    console.log(JSON.stringify(repairSummary(state),null,2));
    if(!state.canRepair){console.error(state.reason);process.exitCode=2;}
    else if(args.includes('--apply')) {
      const result=await repairCharacterContent(sql);
      console.log(`Готово. Восстановлено записей: ${result.restored}. Всего в character_content: ${result.existing}.`);
      console.log('Персонажи, сессии, карты и исходные записи не изменены. Запустите npm.cmd run web.');
    } else if(state.tableExists&&!state.candidates) console.log('Каталог доступен, восстановление не требуется. Проверьте, что сервер запущен из этой же папки с тем же .env.');
    else console.log('Проверка завершена без изменений. Если это ваша прежняя база, остановите сервер и выполните: npm.cmd run db:repair:character-content -- --apply');
  } catch(error) {
    // Do not print DATABASE_URL, driver query parameters or full driver errors.
    const code=String(error.code||'');
    console.error(code?`Восстановление не выполнено. Код базы: ${code}. Проверьте подключение и права пользователя PostgreSQL.`:error.message);
    process.exitCode=1;
  } finally {await sql.end({timeout:5});}
}
