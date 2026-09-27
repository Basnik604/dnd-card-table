# D&D Card Table — Content Core v0.1

Первый технический фундамент будущего web-приложения.

## Что уже заложено
- PostgreSQL
- источники контента и лицензии
- единая таблица content_entities
- отдельная нормализованная таблица creatures
- actions / traits / tags
- русская локализация отдельным слоем
- журнал импортов
- хранение исходного JSON
- importer Open5e V2 для SRD 5.2 / srd-2024

## Быстрый запуск

Требуется Node.js 20+ и Docker Desktop.

1. Скопировать `.env.example` в `.env`
2. Запустить PostgreSQL:

   docker compose up -d

3. Установить зависимости:

   npm install

4. Применить схему:

   npm run db:migrate

5. Импортировать существ:

   npm run import:creatures

Импортёр забирает только Open5e document key `srd-2024`.

## Что будет следующим
1. Проверить импорт на полном SRD-пуле существ.
2. Уточнить поля редких/сложных существ.
3. Добавить Spells importer.
4. Добавить Equipment / Magic Items importer.
5. Сделать Content Library UI.
6. Поверх базы построить Card Engine.
