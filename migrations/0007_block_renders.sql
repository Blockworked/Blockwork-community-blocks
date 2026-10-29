-- Pictures of each block, drawn by Blockwork's editor (the pack viewer on
-- blockworked.com) when an admin reviews the version: JSON
-- {"at": <ms>, "blocks": [{"id", "name", "width", "height"}]}, with the PNGs
-- in R2 under renders/<sha256>/. Empty until then.
ALTER TABLE versions ADD COLUMN renders TEXT NOT NULL DEFAULT '';
