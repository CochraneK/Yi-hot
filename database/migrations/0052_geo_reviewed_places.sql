-- Geo M1: reviewed location relationships. No auto-verification, no automatic backfill.
-- Article revision and publication analysis gates are applied in the public read layer.
CREATE TABLE geo_places (
  id            text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  country_code  text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  region        text,
  city          text,
  lat           double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon           double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  coordinate_precision text NOT NULL CHECK (coordinate_precision IN ('country', 'region', 'city')),
  source_url    text NOT NULL CHECK (source_url ~ '^https://'),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE geo_candidates (
  id             bigserial PRIMARY KEY,
  article_id     text NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  analysis_id    bigint NOT NULL REFERENCES analyses (id) ON DELETE CASCADE,
  place_text     text NOT NULL CHECK (char_length(place_text) BETWEEN 2 AND 80),
  role           text NOT NULL CHECK (role IN ('event', 'affected', 'publisher', 'mentioned')),
  evidence       text NOT NULL CHECK (char_length(evidence) BETWEEN 4 AND 180),
  place_id       text REFERENCES geo_places (id),
  review_status  text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'verified', 'rejected')),
  reviewed_by    text,
  review_reason  text,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, place_text, role, evidence),
  CHECK (review_status <> 'verified' OR (place_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (review_status = 'verified' OR place_id IS NULL)
);

CREATE INDEX geo_candidates_pending_idx ON geo_candidates (id) WHERE review_status = 'pending';
CREATE INDEX geo_candidates_public_idx ON geo_candidates (place_id, article_id, analysis_id)
  WHERE review_status = 'verified' AND role = 'event';

-- Immutable review evidence for audit and corrections.
CREATE TABLE geo_review_audit (
  id            bigserial PRIMARY KEY,
  candidate_id  bigint NOT NULL REFERENCES geo_candidates (id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('approve', 'reject', 'reopen')),
  place_id      text REFERENCES geo_places (id),
  reviewer      text NOT NULL,
  reason        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX geo_review_audit_candidate_idx ON geo_review_audit (candidate_id, created_at DESC);
