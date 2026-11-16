-- Geo: keep the county-level grain, group at city level.
--
-- 江宁区 used to be folded into 南京 at review time, which threw away the only
-- detail the story carried. It is now stored as its own row with the prefecture
-- as parent: the feed may show 江宁区, while the picker and the heat map group by
-- parent_id so one city's news does not split across rows.
--
-- Coordinates on a child row are the parent city's centre; the source list has
-- no district coordinates, and coordinate_precision stays 'city' to say so.
ALTER TABLE geo_places ADD COLUMN IF NOT EXISTS parent_id text REFERENCES geo_places (id);
ALTER TABLE geo_places ADD COLUMN IF NOT EXISTS parent_name text;

ALTER TABLE geo_places DROP CONSTRAINT IF EXISTS geo_places_parent_self;
ALTER TABLE geo_places ADD CONSTRAINT geo_places_parent_self CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX IF NOT EXISTS geo_places_parent_idx ON geo_places (parent_id) WHERE parent_id IS NOT NULL;
