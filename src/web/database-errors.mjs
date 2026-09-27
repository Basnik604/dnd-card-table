export function builderDatabaseError(error,language='ru') {
  if(error?.code!=='42P01'||!(error.table==='character_content'||/"(?:public\.)?character_content"/.test(String(error.message))))return null;
  const ru=language==='ru';
  const title=ru?'Данные конструктора недоступны':'Builder data unavailable';
  const message=ru?'В подключённой базе не найдена таблица character_content. Проверьте прежний .env и запустите проверку каталога.':'The connected database cannot find character_content. Check your original .env and run the catalog check.';
  const note=ru?'Остановите сервер и выполните в папке проекта. Команда сначала проверит базу без изменений и подскажет дальнейшие действия.':'Stop the server and run this in the project directory. The command checks the database without changing it and explains the next step.';
  return {status:503,code:'BUILDER_SCHEMA_MISSING',title,message,content:`<section class="section database-repair-panel" data-i18n-skip><h2>${title}</h2><p>${message}</p><p>${note}</p><pre><code>npm.cmd run db:repair:character-content</code></pre><a class="button secondary" href="/tabletop">${ru?'Открыть игровой стол':'Open game table'}</a></section>`};
}
