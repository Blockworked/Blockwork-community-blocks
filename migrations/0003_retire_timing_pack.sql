-- The Timing starter pack only wrapped built-in wait blocks.
UPDATE packs SET listed = 0
WHERE id = 'timing' AND owner_id = 'blockwork:team';
