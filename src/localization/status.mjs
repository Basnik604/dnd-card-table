import { translationCoverage } from './core.mjs';
import { packEntries, termTranslation } from './runtime.mjs';
export function statusContent(manifest) {
  const c=translationCoverage(manifest,packEntries(),termTranslation);
  const ready=c.reviewed+c.machine+c.terms;
  return `<a class="back" href="/library">← Библиотека</a>
  <section class="hero"><div><h2>Перевод контента</h2><p>Состояние перевода записей, которые действительно импортированы в вашу базу.</p></div><div><span class="count">${ready} / ${c.total}</span><span class="count-label">текстов переведено</span></div></section>
  <div class="stats"><div class="stat"><b>Готовые переводы и термины</b><span>${c.reviewed+c.terms}</span></div><div class="stat"><b>Автоматический перевод</b><span>${c.machine}</span></div><div class="stat"><b>Ещё на английском</b><span>${c.pending}</span></div></div>
  <section class="section" style="margin-top:24px"><p>Технических сегментов исключено из показателя покрытия: ${c.ignored}.</p><p>${c.complete?'Для текущего каталога перевод есть у каждого извлечённого текста.':'Полный перевод текущей базы ещё не завершён.'} Автоматические переводы проходят проверку чисел, формул и структуры; это не заменяет проверку смысла правил.</p><p>Выгрузка содержит только тексты справочника и их источники. Имена персонажей, заметки, изображения и настройки подключения в неё не попадают.</p><a class="button" href="/api/localization/export">Скачать тексты для перевода</a></section>`;
}
