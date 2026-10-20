-- 按源的内容规则（publication_rule）：同一个源里，不同形态的内容走不同的放行门槛。
-- 起因：小红书这类渠道的高分项是「人物善举故事」，而机构动态/政策只有 18–22 分；
-- 一个全局分数线要么放进软文、要么漏掉机构动态，所以把规则下放到源上。
--
-- 结构（都可选，缺省即不限制）：
--   minScore          分数硬线，达到即放行（不看类别）
--   scoreByCategory   { 类别: 更低门槛 }，只对列出的类别生效
--   requireMarkers    走 scoreByCategory 这条轨时，标题或摘要必须出现其中之一（机构/项目主体词）
--   dropCategories    命中即拦，优先于上面三条
--
-- 例：小红书源 minScore=40（人物故事）、scoreByCategory={project:20,policy:18}（机构动态与政策），
-- requireMarkers 要求出现「基金会/协会/项目/计划/政策」等，dropCategories=['fundraising']（个人募捐征集）。
ALTER TABLE sources ADD COLUMN IF NOT EXISTS publication_rule jsonb;

COMMENT ON COLUMN sources.publication_rule IS
  '按源的内容放行规则：minScore / scoreByCategory / requireMarkers / dropCategories，为空表示不额外限制（见 publication/rules.ts）';
