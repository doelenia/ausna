-- Restrict notes.type to supported values.
-- Keep: post, annotation, reaction, open_call, resource.

ALTER TABLE notes
  DROP CONSTRAINT IF EXISTS notes_type_check;

ALTER TABLE notes
  ADD CONSTRAINT notes_type_check
  CHECK (type IN ('post', 'annotation', 'reaction', 'open_call', 'resource'));

