\echo '=== 插入前 ==='
SELECT count(*) AS sources FROM sources;

INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, publication_rule, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
VALUES ('search-tencent-charity', '网页搜索·腾讯公益', 'search', '{"queries": ["腾讯公益 公益项目", "99公益日 腾讯公益"], "count": 24, "lookbackDays": 7, "minAuthority": 2, "_aihot": {"initialBackfillLimit": 12}}'::jsonb, 'T2', false, 'tencent-charity', 'editorial', NULL, 360, ARRAY['搜索','平台']::text[], false, false, true, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, publication_rule, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
VALUES ('search-alipay-charity', '网页搜索·支付宝公益', 'search', '{"queries": ["支付宝公益 捐赠", "蚂蚁集团 公益 项目"], "count": 24, "lookbackDays": 7, "minAuthority": 2, "_aihot": {"initialBackfillLimit": 12}}'::jsonb, 'T2', false, 'alipay-charity', 'editorial', NULL, 360, ARRAY['搜索','平台']::text[], false, false, true, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, publication_rule, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
VALUES ('search-alibaba-charity', '网页搜索·阿里公益', 'search', '{"queries": ["阿里公益 项目", "阿里巴巴 公益 捐赠"], "count": 24, "lookbackDays": 7, "minAuthority": 2, "_aihot": {"initialBackfillLimit": 12}}'::jsonb, 'T2', false, 'alibaba-charity', 'editorial', NULL, 360, ARRAY['搜索','平台']::text[], false, false, true, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, publication_rule, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
VALUES ('search-byte-charity', '网页搜索·抖音公益', 'search', '{"queries": ["抖音公益 项目", "字节跳动 公益"], "count": 24, "lookbackDays": 7, "minAuthority": 2, "_aihot": {"initialBackfillLimit": 12}}'::jsonb, 'T2', false, 'byte-charity', 'editorial', NULL, 360, ARRAY['搜索','平台']::text[], false, false, true, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, publication_rule, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
VALUES ('search-china-youth-development-foundation', '网页搜索·希望工程', 'search', '{"queries": ["希望工程 助学", "中国青少年发展基金会 项目"], "count": 24, "lookbackDays": 7, "minAuthority": 2, "_aihot": {"initialBackfillLimit": 12}}'::jsonb, 'T2', false, 'china-youth-development-foundation', 'editorial', NULL, 360, ARRAY['搜索','助学']::text[], false, false, true, now())
ON CONFLICT (id) DO NOTHING;

\echo '=== 插入后 ==='
SELECT count(*) AS sources FROM sources;
\echo '=== 新源状态 ==='
SELECT id, kind, enabled, owner_entity_id, interval_minutes, next_fetch_at <= now() AS due_now FROM sources WHERE id LIKE 'search-%charity' OR id LIKE 'search-china-youth%' ORDER BY id;
