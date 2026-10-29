-- How each block looks (packs.ts BlockView), so the site can draw it. Empty
-- for versions saved before this; the worker fills those in from R2.
ALTER TABLE versions ADD COLUMN block_views TEXT NOT NULL DEFAULT '';
