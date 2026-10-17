-- Double-opt-in report subscriptions and a durable SMTP outbox.

CREATE TABLE newsletter_subscriptions (
  id                    bigserial PRIMARY KEY,
  email                 text NOT NULL,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed', 'bounced', 'complained')),
  weekly                boolean NOT NULL DEFAULT true,
  monthly               boolean NOT NULL DEFAULT true,
  confirm_token_hash    text,
  confirm_expires_at    timestamptz,
  confirmed_at          timestamptz,
  unsubscribed_at       timestamptz,
  bounce_count          integer NOT NULL DEFAULT 0,
  last_bounce_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX newsletter_subscriptions_email_idx ON newsletter_subscriptions ((lower(email)));
CREATE INDEX newsletter_subscriptions_active_idx ON newsletter_subscriptions (status) WHERE status = 'active';

CREATE TABLE newsletter_outbox (
  id               bigserial PRIMARY KEY,
  subscription_id  bigint NOT NULL REFERENCES newsletter_subscriptions(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('confirmation', 'report')),
  dedupe_key       text NOT NULL UNIQUE,
  payload          jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown', 'cancelled')),
  attempts         integer NOT NULL DEFAULT 0,
  available_at     timestamptz NOT NULL DEFAULT now(),
  leased_at        timestamptz,
  sent_at          timestamptz,
  response         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX newsletter_outbox_due_idx ON newsletter_outbox (available_at, id) WHERE status IN ('pending', 'failed');
