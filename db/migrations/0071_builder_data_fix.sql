ALTER TYPE content_entity_type ADD VALUE IF NOT EXISTS 'subclass';

ALTER TABLE character_content
  DROP CONSTRAINT IF EXISTS character_content_content_kind_check;

ALTER TABLE character_content
  ADD CONSTRAINT character_content_content_kind_check
  CHECK (content_kind IN ('class','subclass','species','background','feat'));
