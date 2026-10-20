-- 监管记录域：民政部对全国性社会组织的行政处罚，以及全国社会组织活动异常名录 /
-- 严重违法失信名单的列入、移出与送达公告。
-- 数据源是中国社会组织政务服务平台（chinanpo.mca.gov.cn）公开的 JSON 接口，
-- 政府信息公开范围内的公开发布内容；记录按 (source_key, external_id) 幂等，重跑只更新不重复。
--
-- record_type:
--   penalty             行政处罚（民政部对全国性社会组织）
--   abnormal_enrol      列入社会组织活动异常名录
--   abnormal_remove     移出社会组织活动异常名录
--   dishonesty_enrol    列入社会组织严重违法失信名单
--   dishonesty_remove   移出社会组织严重违法失信名单
--   delivery            列入名录/名单的送达公告
--
-- org_kind 由统一社会信用代码前两位推导：51 社会团体、52 民办非企业单位、53 基金会。
-- published_on 只精确到日（上游只给日期），接口原样透出 YYYY-MM-DD。
CREATE TABLE regulatory_records (
  id              bigserial PRIMARY KEY,
  source_key      text NOT NULL,
  external_id     text NOT NULL,
  record_type     text NOT NULL CHECK (record_type IN (
                    'penalty', 'abnormal_enrol', 'abnormal_remove',
                    'dishonesty_enrol', 'dishonesty_remove', 'delivery')),
  org_name        text NOT NULL,
  unified_code    text,
  org_kind        text CHECK (org_kind IN ('social_group', 'private_non_enterprise', 'foundation')),
  entity_id       text,
  region          text,
  case_no         text,
  punish_name     text,
  punish_result   text,
  punish_reason   text,
  punish_basis    text,
  punish_organ    text,
  punish_on       date,
  enrol_reason    text,
  enrol_gist      text,
  enrol_on        date,
  remove_reason   text,
  remove_gist     text,
  remove_on       date,
  register_dept   text,
  address         text,
  published_on    date NOT NULL,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, external_id)
);

CREATE INDEX regulatory_records_type_published_idx ON regulatory_records (record_type, published_on DESC);
CREATE INDEX regulatory_records_published_idx ON regulatory_records (published_on DESC);
CREATE INDEX regulatory_records_org_idx ON regulatory_records (org_name);
CREATE INDEX regulatory_records_code_idx ON regulatory_records (unified_code) WHERE unified_code IS NOT NULL;
CREATE INDEX regulatory_records_entity_idx ON regulatory_records (entity_id) WHERE entity_id IS NOT NULL;
