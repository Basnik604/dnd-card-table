-- Quick inspection queries after the first import

SELECT COUNT(*) AS creature_count
FROM content_entities
WHERE entity_type = 'creature';

SELECT
  ce.name_en,
  c.creature_type,
  c.challenge_rating,
  c.hit_points,
  c.armor_class
FROM content_entities ce
JOIN creatures c ON c.entity_id = ce.id
WHERE ce.entity_type = 'creature'
ORDER BY ce.name_en
LIMIT 25;

SELECT
  ce.name_en AS creature,
  a.action_type,
  a.name_en AS action
FROM entity_actions a
JOIN content_entities ce ON ce.id = a.entity_id
ORDER BY ce.name_en, a.sort_order
LIMIT 50;

SELECT *
FROM import_runs
ORDER BY started_at DESC
LIMIT 5;
