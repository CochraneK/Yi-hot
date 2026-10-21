-- 监管记录按地区检索：把自由的 region 文本（源自登记管理机关，层级混杂、含脏数据）
-- 归一成「省/直辖市/自治区」(region_province) 与「市/地区/自治州」(region_city) 两级，
-- 便于按省市筛选。归一化逻辑在 packages/backend/src/records/region.ts，
-- 既有数据由 scripts/backfill-record-region.ts 一次性回填。
ALTER TABLE regulatory_records ADD COLUMN region_province text;
ALTER TABLE regulatory_records ADD COLUMN region_city text;

CREATE INDEX regulatory_records_province_idx ON regulatory_records (region_province) WHERE region_province IS NOT NULL;
CREATE INDEX regulatory_records_city_idx ON regulatory_records (region_city) WHERE region_city IS NOT NULL;
