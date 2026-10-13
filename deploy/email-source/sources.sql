INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, enabled, health, tags, first_party, site_fulltext, syndicate_fulltext)
VALUES
  ('email-amcham-events', 'AmCham China Events 邮件', 'external', '{"connector":"email","sender":"amchamevent@amchamchina.org","topics":"social-impact-only"}'::jsonb, 'T2', 'editorial', 30, true, 'ok', ARRAY['email','amcham','social-impact'], true, false, false),
  ('email-amity-chuanyi', '爱德传一基金 · 慈善纪事简报', 'external', '{"connector":"email","sender":"aidechuany@batch.lingxi360.com"}'::jsonb, 'T2', 'editorial', 30, true, 'ok', ARRAY['email','newsletter'], true, false, false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  config = EXCLUDED.config,
  tier = EXCLUDED.tier,
  participation_mode = EXCLUDED.participation_mode,
  interval_minutes = EXCLUDED.interval_minutes,
  enabled = EXCLUDED.enabled,
  tags = EXCLUDED.tags,
  first_party = EXCLUDED.first_party,
  site_fulltext = false,
  syndicate_fulltext = false;
