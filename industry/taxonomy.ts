// 这个行业的分类体系：类别、标签词表、机构（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉模型怎么归类。
 * 没归上类的资料在日报里放进最后一节。
 */
export const CATEGORIES = [
  { key: "policy", label: "政策/监管", section: "政策与监管", guide: "民政部等主管部门发布的管理办法、规范性文件、公告通知，以及主管部门自行发布的官方解读；第三方对政策的深度分析见「政策分析」" },
  { key: "policy-analysis", label: "政策分析", section: "政策分析", guide: "第三方（专家、智库、媒体、行业机构）对已有法规政策的深度解读、影响分析、执行评估与专家点评" },
  { key: "organization", label: "机构", section: "机构动态", guide: "基金会、慈善组织、公益机构的人事、合作、年报、备案年检、评估等机构自身动态" },
  { key: "project", label: "项目", section: "项目动态", guide: "公益项目与计划的新设、开展、进展、受益情况和项目成果" },
  { key: "fundraising", label: "募集", section: "募集与数据", guide: "募捐活动、筹款数据、资金流向、财务披露与公开募捐进展" },
  { key: "research", label: "研究", section: "研究与标准", guide: "行业研究报告、标准规范、评估指数（如中基透明指数）与学术研究" },
  { key: "field", label: "一线", section: "一线与人物", guide: "公益一线的工作故事、志愿者与受助者故事、公益人物报道" },
  { key: "opinion", label: "观点", section: "一线与人物", guide: "公益人物的观点、评论、分析、访谈，以及行业现象与趋势讨论" },
] as const;

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["policy_release", "policy_analysis", "organization_event", "project_update", "fundraising_data", "research_report", "field_story", "opinion_analysis"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "政策/监管", "政策分析", "机构动态", "项目更新", "募集/数据", "研究/报告", "一线/人物", "观点/评论", "行业趋势",
  "非公益/其他", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "乡村振兴", "乡村教育", "儿童关爱", "儿童保护", "儿童心理", "养老服务", "残障融合", "医疗救助", "环境保护", "应急救援",
  "社区公益", "透明慈善", "志愿者", "企业公益", "慈善捐赠", "公益金融", "公益科技", "国际公益", "资助申请",
] as const;

/** 可选的实体标签（机构、平台、主管部门）。 */
export const ENTITY_TAGS = ["腾讯公益", "支付宝公益", "阿里公益", "抖音公益", "壹基金", "中国慈善联合会", "中国乡村发展基金会", "中国青少年发展基金会", "南都公益基金会", "基金会中心网", "民政部", "救助儿童会"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  政策: "政策/监管", 监管: "政策/监管", 法规: "政策/监管", 法律法规: "政策/监管", 公告: "政策/监管", 通知: "政策/监管", 文件: "政策/监管",
  政策评析: "政策分析", 政策点评: "政策分析", 政策深读: "政策分析", 政策影响分析: "政策分析", 新规解读: "政策分析",
  机构新闻: "机构动态", 基金会动态: "机构动态", 组织动态: "机构动态",
  项目动态: "项目更新", 项目进展: "项目更新", 计划: "项目更新",
  募捐: "募集/数据", 筹资: "募集/数据", 捐赠: "募集/数据", 筹款: "募集/数据",
  研究: "研究/报告", 报告: "研究/报告", 指数: "研究/报告",
  一线: "一线/人物", 一线故事: "一线/人物", 志愿者故事: "一线/人物",
  观点: "观点/评论", 评论: "观点/评论", 访谈: "观点/评论",
  趋势: "行业趋势", 现象: "行业趋势", 行业: "行业趋势", 动态: "行业趋势",
  非公益: "非公益/其他",
  扶贫: "乡村振兴", 助农: "乡村振兴",
  助学: "乡村教育", 支教: "乡村教育", 教育: "乡村教育",
  儿童: "儿童关爱",
  养老: "养老服务", 助老: "养老服务", 老人: "养老服务",
  残障: "残障融合", 助残: "残障融合", 特殊需要: "残障融合",
  医疗: "医疗救助", 大病: "医疗救助",
  环保: "环境保护", 生态: "环境保护",
  救灾: "应急救援", 救援: "应急救援",
  社区: "社区公益", 社区服务: "社区公益",
  透明指数: "透明慈善", 透明: "透明慈善",
  志愿服务: "志愿者",
  企业慈善: "企业公益", 公司公益: "企业公益",
  公益投资: "公益金融",
  科技公益: "公益科技", 智慧公益: "公益科技",
  国际慈善: "国际公益", 海外公益: "国际公益",
  "99公益日": "腾讯公益", "99日": "腾讯公益",
  蚂蚁公益: "支付宝公益", 蚂蚁集团公益: "支付宝公益", 天天正能量: "支付宝公益",
  阿里巴巴公益: "阿里公益",
  字节公益: "抖音公益",
  中慈联: "中国慈善联合会",
  扶贫基金会: "中国乡村发展基金会", 中国扶贫基金会: "中国乡村发展基金会",
  希望工程: "中国青少年发展基金会",
  中基透明指数: "基金会中心网", FTI: "基金会中心网",
  未成年人保护: "儿童保护", 反性侵: "儿童保护", 性侵害: "儿童保护", 防拐: "儿童保护", 儿童安全: "儿童保护", 儿童权益: "儿童保护",
  儿童心理健康: "儿童心理", 心理援助: "儿童心理", 儿童情绪: "儿童心理",
  爱心捐赠: "慈善捐赠", 大额捐赠: "慈善捐赠", 企业家捐赠: "慈善捐赠",
  公益创投: "资助申请", 公益资助: "资助申请", 资助项目: "资助申请", 基金申报: "资助申请",
};

/** 模型漏了分类标签时，按内容类型补一个。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  policy_release: "政策/监管", policy_analysis: "政策分析", organization_event: "机构动态", project_update: "项目更新", fundraising_data: "募集/数据",
  research_report: "研究/报告", field_story: "一线/人物", opinion_analysis: "观点/评论",
};

// ── 机构与主体 ──────────────────────────────────────────────────────────────────────────

/** 机构主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  "tencent-charity": { name: "腾讯公益", displayTag: "腾讯公益", aliases: ["腾讯公益", "99公益日", "99日", "腾讯微公益"] },
  "alipay-charity": { name: "支付宝公益", displayTag: "支付宝公益", aliases: ["支付宝公益", "蚂蚁公益", "蚂蚁集团公益", "天天正能量"] },
  "alibaba-charity": { name: "阿里公益", displayTag: "阿里公益", aliases: ["阿里公益", "阿里巴巴公益"] },
  "byte-charity": { name: "抖音公益", displayTag: "抖音公益", aliases: ["抖音公益", "字节公益"] },
  "one-foundation": { name: "壹基金", displayTag: "壹基金", aliases: ["壹基金"] },
  "china-charity-federation": { name: "中国慈善联合会", displayTag: "中国慈善联合会", aliases: ["中国慈善联合会", "中慈联"] },
  "china-rural-development-foundation": { name: "中国乡村发展基金会", displayTag: "中国乡村发展基金会", aliases: ["中国乡村发展基金会", "中国扶贫基金会", "扶贫基金会"] },
  "china-youth-development-foundation": { name: "中国青少年发展基金会", displayTag: "中国青少年发展基金会", aliases: ["中国青少年发展基金会", "希望工程", "青基会"] },
  "south-metro-public-welfare": { name: "南都公益基金会", displayTag: "南都公益基金会", aliases: ["南都公益基金会"] },
  "foundation-center": { name: "基金会中心网", displayTag: "基金会中心网", aliases: ["基金会中心网", "中基透明指数", "FTI"] },
  "ministry-of-civil-affairs": { name: "民政部", displayTag: "民政部", aliases: ["民政部"] },
  "save-the-children": { name: "救助儿童会", displayTag: "救助儿童会", aliases: ["救助儿童会", "Save the Children", "国际救助儿童会"] },
};

/**
 * 身份词典：摘要和标题里出现的机构，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "tencent-charity", name: "腾讯公益", patterns: [/腾讯公益|99公益日|99日|腾讯微公益/i] },
  { id: "alipay-charity", name: "支付宝公益", patterns: [/支付宝公益|蚂蚁公益|蚂蚁集团公益|天天正能量|支付宝慈善/i] },
  { id: "alibaba-charity", name: "阿里公益", patterns: [/阿里公益|阿里巴巴公益/i] },
  { id: "byte-charity", name: "抖音公益", patterns: [/抖音公益|字节公益|字节跳动公益/i] },
  { id: "one-foundation", name: "壹基金", patterns: [/壹基金/i] },
  { id: "china-charity-federation", name: "中国慈善联合会", patterns: [/中国慈善联合会|中慈联/i] },
  { id: "china-rural-development-foundation", name: "中国乡村发展基金会", patterns: [/中国乡村发展基金会|中国扶贫基金会/i] },
  { id: "china-youth-development-foundation", name: "中国青少年发展基金会", patterns: [/中国青少年发展基金会|希望工程|青基会/i] },
  { id: "south-metro-public-welfare", name: "南都公益基金会", patterns: [/南都公益基金会/i] },
  { id: "foundation-center", name: "基金会中心网", patterns: [/基金会中心网|中基透明指数/i] },
  { id: "ministry-of-civil-affairs", name: "民政部", patterns: [/民政部/i] },
  { id: "save-the-children", name: "救助儿童会", patterns: [/救助儿童会|Save the Children/i] },
];

/** 这些域名上的文章，发布方就是对应的机构（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "ministry-of-civil-affairs", domains: ["mca.gov.cn"] },
  { entityId: "tencent-charity", domains: ["gongyi.qq.com"] },
  { entityId: "china-youth-development-foundation", domains: ["cydf.org.cn"] },
  { entityId: "one-foundation", domains: ["onefoundation.org.cn", "onefoundation.cn"] },
  { entityId: "foundation-center", domains: ["foundationcenter.org.cn"] },
  { entityId: "china-rural-development-foundation", domains: ["crdf.org.cn", "cfrd.org.cn", "cfpa.org.cn"] },
  { entityId: "save-the-children", domains: ["savethechildren.org.cn"] },
];

/** 原文里的这些写法也算提到了对应机构。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "alipay-charity", pattern: /蚂蚁集团\s*公益/i },
];
