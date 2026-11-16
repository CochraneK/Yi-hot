// 「邻域」面向跨来源信息聚合站，不等于 YiHot 主站 RSS 信源库。
// tier=resource 的资料入口不在邻域页面展示；directoryVisible=false 的纯发布站
// （如联合国自身新闻页）只留来源登记，不单独占用邻域卡片。
// 有些来自 AIHOT 框架，也有单独的专题/演示站，不能宣称全部使用相同技术栈。
//
// 准入原则（2026-11-16）：RSS/API 优先，但有价值的垂直行业站即使仅浏览也可以正式展示；
// 可能重复、暂未接入同步或同步失败均只作透明提示，不作为降级理由。
// 付费深度服务、静态演示及单期快照留在候选信息；权威数据库与机会入口归实用资源。
// 可同步 ≠ 可以加入 YiHot 主站新闻。
// 两条已有技术路径（2026-11-15 公开网站实测）：
//   1. 可同步：网页在线、API 或 RSS 可读，至少能拿到标题/摘要/原始链接；
//      只读已由对方编辑过的索引，**不因邻域展示增加 YiHot 的模型调用**。
//   2. 仅浏览：有明确领域、网页可打开，但 RSS/API 不可用或暂未公开；
//      strategy="link"，只展示可点击官网，不冒充已同步、也不做后台抓取。
// 无法访问的网站保留为 strategy="none" + enabled=false，不进入公开目录。
// 与独立的 industry/sources.json RSS 技术信源严格分层，那里新源默认停用。
//
// 名录来源不只自己找：上游 GitHub Discussions 的 #306（用 AIHOT 做了站？在这里登记一下）和
// #284 的「社区改造清单（16 个站）」是主要线索。补站前先按上面三条实测，别只看名单。
//
// 2026-11-15 又加了一条更彻底的路：**读全部 fork 的 site/site.ts**。fork 的 description 与
// homepage 默认继承上游，改的人很少；但每个真做了站的人都会动 SITE.name。2531 个 fork 里
// 11-01 之后仍有推送的 485 个，逐个读 site/site.ts 得到 38 个改过站名的，其中 2 个有公网
// 接口（本文件末尾那两家）。剩下 36 个多数是自部署、没有对外地址——找得到站名也进不来。
// 复现方式见 .workbuddy 里的思路：raw.githubusercontent.com 直连不通，node 的 fetch 不读
// HTTP_PROXY，要显式挂 undici 的 ProxyAgent。
//
// 数组顺序是**同分时的默认顺序**，也是周报/月报（名额多）的呈现顺序：先和公益读者最近的
// （心理精神医学、环保双碳、城市公共事务、医药生信），再到科技、商业、安全。
// 日报只有 3 个名额，若固定按这个顺序取，第 4 家以后永远轮不上，所以日报按「近期最少出现」
// 轮换（见 packages/backend/src/peers/select.ts 的 rotationOrder）。
// 改这个文件后必须重建镜像才对生产生效（api 与 worker 都读它）。
/** 同系只用于有明确开源谱系/社区登记证据的站；其他包含独立项目及未核实来源。 */
// 规则追加（2026-11-16）：内容重叠、同步失败/无公开 RSS/API 不自动降低正式邻域级别；
// overlapPossible 仅标「可能重合」而非断言具体文章重复；抓取健康单独标注。
// 付费深度服务、静态演示和单期快照仍可列入候选信息。
export type PeerFamily = "same" | "other";
/** 正式信息站 / 实用资源 / 候选信息，与同系/其他谱系正交。 */
export type PeerTier = "official" | "resource" | "candidate";

export interface PeerSite {
  id: string;
  name: string;
  /** 展示归属：同系邻域 / 其他邻域，与行业 group 正交。 */
  family: PeerFamily;
  /** 公开展示层：候选保留原站和审计记录，但不作为正式实时资讯推荐。 */
  tier: PeerTier;
  /** 不展示在「邻域」的纯发布源，仍保留信源与历史数据。 */
  directoryVisible?: boolean;
  /** 综合聚合可能与其他邻域报道同一事件，仅作阅读提示，未量化重复率。 */
  overlapPossible?: boolean;
  /** 特定站的非日报更新节奏；没有填写时正式新闻站按 7 天时效核查。 */
  cadence?: "weekly";
  /** 站点首页；条目链接一律用条目自己的 URL，不用这个拼。 */
  url: string;
  /** 一句话方向，显示在版块里，让读者知道这是哪个领域。 */
  note: string;
  /**
   * 这家站的身份色，用在目录页的顶条与首字徽标上。
   *
   * 为什么要有：十几张卡片顶条全是同一个品牌红时，卡片之间没有任何可抓的差别，看上去像
   * 同一个模块重复了十几遍。每站一色之后，读者第二次来能靠颜色认站，不用逐张读名字。
   * 取色规则：色相沿环均匀铺开、饱和度压在 45% 上下、明度 40–48%，这样十几色并排还是一套，
   * 不会花；深色主题由 app.css 的 .peer-accent 统一提亮，不用在这里维护第二套值。
   * 新站选了跟邻居太近的颜色，比没色更糟——先看一圈现有色相再定。
   */
  accent: string;
  /**
   * api  = 有标准 /api/v1 接口（优先 items，退回 dailies）
   * rss  = 只有 RSS
   * link = 网页可访问但没有可验证的 API/RSS；只列友情链接，不自动同步
   * none = 目前无可用出口，不展示
   */
  strategy: "api" | "rss" | "link" | "none";
  /** RSS-only sites may use /rss.xml or a subdirectory instead of /feed.xml. */
  feedPath?: string;
  /** 目录页的分组（见下方 PEER_GROUPS）。加站时挑一个已有组，别为一家站新开一组。 */
  group: PeerGroupId;
  enabled: boolean;
}

/**
 * 目录页的分组。
 *
 * 为什么要有：卡片从 10 张涨到 16 张之后，一页扫下来全是同构的方块，读者只能逐张读名字才知道
 * 这家是干什么的。分组之后一眼能看出「这一屏都是技术方向」。
 *
 * 2026-11-15 重切过一次。旧版是 health/public/tech/ai/biz 五组，按学科切，结果两组长到装不下：
 * 「技术与安全」17 家里只有 2 家安全站，还混着科研、资助入口、机器人、设计；「公共与环境」把
 * 汽车产业和房地产当公共事务。重切改成按「读者想找什么」分：找钱、找人、找文献、找工具、
 * 看行业，而不是按学科归属。
 *
 * 组的顺序就是页面的呈现顺序：先和公益读者最近的（健康、公共、资助），再到研究与工具，
 * 最后是资讯与商业。**组名稳定**——改标签不需要动代码，但一次改名会让老读者找不到原来的位置。
 *
 * 一条硬约束：不要为了一家站单开一个组。一个组里只有一张卡时，分组反而比不分组更空。
 */
export type PeerGroupId =
  | "health"
  | "civic"
  | "nonprofit"
  | "research"
  | "product"
  | "news"
  | "market"
  | "growth";

export const PEER_GROUPS: { id: PeerGroupId; label: string; note: string }[] = [
  { id: "health", label: "健康与生命", note: "心理、精神医学与生物医药" },
  { id: "civic", label: "公共与人文", note: "环境、城市、住房、法律与人文社科" },
  { id: "nonprofit", label: "资助与公益", note: "公益机构、基金会、资助征集与公益岗位" },
  { id: "research", label: "研究与工程", note: "科研进展、文献检索、机器人、航天与算力" },
  { id: "product", label: "技术与工具", note: "AI 工具、界面设计与安全情报" },
  { id: "news", label: "综合 AI 资讯", note: "不限行业，什么都谈" },
  { id: "market", label: "市场与产业", note: "金融、公司动态、产业与创业机会" },
  { id: "growth", label: "产品与增长", note: "营销、跨境与企业服务" },
];

/** 分不出来的时候统一落在这里，页面不会因为某个站漏填 group 就整块消失。 */
export const PEER_GROUP_FALLBACK = { id: "other", label: "其他", note: "还没归类" } as const;

/** 姊妹站清单。enabled=false 的仍显示在后台状态里，便于知道「为什么这一家没内容」。 */
export const PEER_SITES: PeerSite[] = [
  {
    id: "psyhot",
    family: "same",
    tier: "official",
    name: "PsyHOT",
    url: "https://psyhot.cn",
    note: "心理学与精神医学，学界与业界双视角",
    group: "health",
    accent: "#4a5a9c",
    strategy: "api",
    enabled: true,
  },
  {
    // 2026-11-15 核实：真实 RSS 在 /ai-ux-research-hot/rss.xml；/URHOT/ 已失效。
    id: "urhot",
    family: "same",
    tier: "official",
    name: "URHOT",
    url: "https://huangzhenhao90.github.io/ai-ux-research-hot/",
    note: "AI × 用户研究，HCI 方法、工具与设计研究",
    group: "product",
    accent: "#775a83",
    strategy: "rss",
    feedPath: "/ai-ux-research-hot/rss.xml",
    enabled: true,
  },
  {
    // 2026-11-15 核实行业日报和招投标雷达，/feed.xml 为 404，仅浏览。
    id: "sanyu-insights",
    family: "other",
    tier: "official",
    name: "三禹智能 · 行业情报",
    url: "https://www.sanyusmart.com/insights/",
    note: "智慧水利、行业 AI、招投标商机",
    group: "market",
    accent: "#648a62",
    strategy: "link",
    enabled: true,
  },
  {
    id: "qingyan",
    family: "same",
    tier: "official",
    name: "青砚",
    url: "https://qingyannews.cn",
    note: "环保与双碳",
    group: "civic",
    accent: "#2f7a55",
    strategy: "api",
    enabled: true,
  },
  {
    // 扫 fork 的 site/site.ts 找到（nidao003/AIHOT-metro），2026-11-15 实测 /api/v1/items 标准、
    // feed.xml 可用。城轨是名录里第一个公共基础设施方向。
    id: "metrohot",
    family: "same",
    tier: "official",
    name: "MetroHot",
    url: "https://metrohot.oohforce.com",
    note: "城市轨道交通，地铁运营、TOD 开发与站点商业",
    group: "civic",
    accent: "#4a8a7a",
    strategy: "api",
    enabled: true,
  },
  {
    // #306 登记，2026-11-15 实测 /api/v1/items 标准、feed.xml 可用。
    id: "bioinfosoul",
    family: "same",
    tier: "official",
    name: "生信之灵",
    url: "https://bioinfosoul.com",
    note: "生信与 AI 制药，科研进展与临床审批",
    group: "health",
    accent: "#5f7d2a",
    strategy: "api",
    enabled: true,
  },
  {
    // 2026-11-15 核实 /feed.xml 有当日精选；/api/v1/items 返回 not_exported。
    id: "gamehot",
    family: "same",
    tier: "official",
    name: "GameHOT",
    url: "https://gamehot.org/",
    note: "游戏产业、产品设计、发行运营与玩家反馈",
    group: "market",
    accent: "#a05b57",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 核实 /feed.xml 有财经及产业精选，独立站而非 aihot.news。
    id: "myhot-finance",
    family: "same",
    tier: "official",
    name: "MyHOT · 市场观察",
    url: "https://aihot.wscn.net/",
    note: "金融市场、产业政策与商业动态",
    group: "market",
    accent: "#867449",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 核实公开产品/融资分析页，但 /feed.xml 为 404，仅浏览。
    id: "xocto",
    family: "other",
    tier: "resource",
    name: "x-octo · 机会库",
    url: "https://xocto.vercel.app/",
    note: "AI 产品研究、融资与创业机会（公开资料库）",
    group: "market",
    accent: "#5d8572",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 核实公开趋势页，后台登录限制；/feed.xml、/rss.xml 为 404。
    id: "aimfast",
    family: "other",
    tier: "candidate",
    name: "AimFast",
    url: "https://www.aimfast.dev/",
    note: "创业趋势与产品机会，深度分析需付费（候选信息）",
    group: "market",
    accent: "#4c8b91",
    strategy: "link",
    enabled: true,
  },
  {
    id: "innews",
    family: "same",
    tier: "official",
    name: "大厂观察",
    url: "https://innews.site",
    note: "互联网大厂动态与职场信息",
    group: "market",
    accent: "#b2562c",
    strategy: "api",
    enabled: true,
  },
  {
    id: "sevenailab",
    family: "same",
    tier: "official",
    name: "品牌AI外刊",
    url: "https://news.sevenailab.com",
    note: "海外品牌营销与 AI 带来的变化",
    group: "growth",
    accent: "#744a8e",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 核实：/robot-hot/feed.xml 可读；/robot-hot/rss.xml 不存在。
    id: "aiman-robot-hot",
    family: "other",
    tier: "official",
    name: "聚身之家",
    url: "https://www.aiman.world/robot-hot/",
    note: "具身智能，机器人产业、研究与产品证据",
    group: "research",
    accent: "#397680",
    strategy: "rss",
    feedPath: "/robot-hot/feed.xml",
    enabled: true,
  },
  {
    id: "robohot",
    family: "same",
    tier: "official",
    name: "RoboHot",
    url: "https://robohot.news",
    note: "机器人产业，面向研发者与准备入行的人",
    group: "research",
    accent: "#2a7480",
    strategy: "api",
    enabled: true,
  },
  {
    id: "mediastack",
    family: "same",
    tier: "official",
    name: "MediaStack",
    url: "https://mediastack.work",
    note: "音视频技术情报",
    group: "research",
    accent: "#2f6390",
    strategy: "api",
    enabled: true,
  },
  {
    id: "filmtech",
    family: "same",
    tier: "official",
    name: "FilmTechNews",
    url: "https://filmtech.lumenghe.com",
    note: "影视技术日报",
    group: "research",
    accent: "#8f3a44",
    strategy: "api",
    enabled: true,
  },
  {
    id: "ai4math",
    family: "same",
    tier: "official",
    name: "AI4Math Radar",
    url: "https://charlie-wang-03.github.io/ai4math-radar/",
    note: "AI for Mathematics 研究动态",
    group: "research",
    accent: "#3f7a3f",
    strategy: "rss",
    enabled: true,
  },
  {
    // 扫 fork 的 site/site.ts 找到（TJJAom/AIHOT），2026-11-15 实测 /api/v1/items 标准。
    // 名录里第一家用繁体中文写作的站，条目里会出现「輝達」「軟體」这类译名。
    id: "dayacre",
    family: "same",
    tier: "official",
    overlapPossible: true,
    name: "日耕 AI 熱點",
    url: "https://aihot.dayacre.com",
    note: "AI 动态的繁中版，台湾读者的用语与视角",
    group: "news",
    accent: "#9a5a9a",
    strategy: "api",
    enabled: true,
  },
  {
    // #254 登记，2026-11-15 实测 /api/v1/items 标准。
    id: "foxnan",
    family: "same",
    tier: "official",
    overlapPossible: true,
    name: "AI快讯",
    url: "https://hot.foxnan.com",
    note: "AI 新闻与每日动态",
    group: "news",
    accent: "#2f7fa8",
    strategy: "api",
    enabled: true,
  },
  {
    // #98 登记，只有 Atom feed（/api/v1/* 全 404），feed 的 entry link 直接是原文地址。
    id: "xabcnews",
    family: "same",
    tier: "official",
    overlapPossible: true,
    name: "XABC News",
    url: "https://xabcnews.com",
    note: "AI、开发者与前沿科技的全网热点",
    group: "news",
    accent: "#8a6a2a",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 实测 /api/v1/items 标准，方向是漏洞情报。
    id: "vulnhot",
    family: "same",
    tier: "official",
    name: "VulnHOT",
    url: "https://vulnhot.com",
    note: "漏洞情报与安全事件",
    group: "product",
    accent: "#8c3a72",
    strategy: "api",
    enabled: true,
  },
  {
    // 域名 2026-11-15 实测已失效：news.blues19.com 与 apex blues19.com 都无 A 记录。
    // 仍然保留在表里并继续探测（DNS 失败只需 1ms），站主恢复解析后自动接上。
    id: "blues19",
    family: "same",
    tier: "official",
    name: "拾玖跨境资讯",
    url: "https://news.blues19.com",
    note: "跨境电商，按平台政策与运营重建了主题体系",
    group: "growth",
    accent: "#5a4a9e",
    strategy: "api",
    enabled: true,
  },
  {
    // 实测 /feed.xml、/rss.xml、/api/v1/* 全 404（Next.js 站，接口未导出）。
    id: "yingxiao",
    family: "same",
    tier: "candidate",
    name: "营销通鉴 · 平台动态",
    url: "https://yingxiaoclub.com/news",
    note: "营销平台的规则变化与新功能早报",
    group: "growth",
    accent: "#7a7a72",
    strategy: "none",
    enabled: false,
  },
  {
    // 2026-11-15 实测主页与 /feed.xml，汽车新闻有实际更新时间。
    id: "autohot",
    family: "same",
    tier: "official",
    name: "AutoHot",
    url: "https://www.autohot.top/",
    note: "汽车产业、新车型、出行技术与政策",
    group: "market",
    accent: "#526fa2",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 实测主页与 /feed.xml，住房/物业有近期政策信息。
    id: "huifangyun",
    family: "same",
    tier: "official",
    name: "汇房云资讯",
    url: "https://info.huifangyun.com/",
    note: "房地产、物业监管、住房与社区服务",
    group: "civic",
    accent: "#907248",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 实测 /feed.xml 和 /api/v1/items 返回实际文章。
    id: "fai-lab",
    family: "same",
    tier: "official",
    name: "FAI 实验室",
    url: "https://fai.fashion/",
    note: "AI 工具、设计与内容生产，也有通用 AI 资讯",
    group: "product",
    accent: "#7a6177",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 公开材料/化学研究条目可读；/ai4scihot/feed.xml 返回 403。
    id: "ai4scihot",
    family: "same",
    tier: "official",
    name: "AI4SciHOT",
    url: "https://ai4scihot.8-220-189-127.sslip.io/ai4scihot",
    note: "AI for Science：材料、化学、物理与工业仿真",
    group: "research",
    accent: "#5c7b65",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 公开专题可浏览；/feed.xml 和 /horizon/feed.xml 为 404。
    // 这是 UU AI Hub 专题，不是独立运行的「发射窗口」AIHOT 服务。
    id: "horizon-uu",
    family: "other",
    tier: "official",
    name: "发射窗口",
    url: "https://www.uuaihub.com/horizon",
    note: "商业航天、AI 芯片与机器人专题入口",
    group: "research",
    accent: "#8b704b",
    strategy: "link",
    enabled: true,
  },
  {
    // AIHOT Show and tell #333，2026-11-15 实测：仅为静态演示页。
    id: "fengxiang-demo",
    family: "same",
    tier: "candidate",
    name: "风向",
    url: "https://fightkk7.github.io/fengxiang/",
    note: "企业服务与 SaaS 资讯（静态产品演示）",
    group: "growth",
    accent: "#96724d",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 公共站可浏览，/feed.xml 与 /rss.xml 均为 404。
    id: "newsiq",
    family: "other",
    tier: "official",
    overlapPossible: true,
    name: "NewsIQ · 讯析",
    url: "https://newsiq.xyz/",
    note: "新闻事件聚合与跨来源分析",
    group: "news",
    accent: "#4e7290",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 核实 /feed.xml 有当日多源研究条目；与已有 AI 热点站功能部分交叉。
    id: "ai-pulse-lab",
    family: "other",
    tier: "official",
    overlapPossible: true,
    name: "AI Pulse",
    url: "https://ai-pulse-lab.com/",
    note: "多源 AI 信号、研究分析与知识检索",
    group: "news",
    accent: "#5c6b8d",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 官网有 NGO 招聘与公益资源；/feed.xml 和 /rss.xml 均未提供可用内容
    id: "cdb-ngo",
    family: "other",
    tier: "resource",
    name: "中国发展简报",
    url: "https://www.chinadevelopmentbrief.org.cn/",
    note: "公益招聘、资助招标、机构动态与专业培训",
    group: "nonprofit",
    accent: "#4b7a67",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 新闻公开可读；近期条目到 2026-06；没有经核实的稳定 RSS，不能声称每日更新
    id: "foundation-center",
    family: "other",
    tier: "resource",
    name: "基金会中心网",
    url: "https://foundationcenter.org.cn/news",
    note: "基金会信息披露、慈善数据与合规研究",
    group: "nonprofit",
    accent: "#627993",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网及 WordPress /feed/ 实测有 2026-11 更新；政策解释非官方版本
    id: "china-law-translate",
    family: "other",
    tier: "resource",
    name: "China Law Translate",
    url: "https://www.chinalawtranslate.com/",
    note: "中国法律政策的非官方翻译、修法跟踪与分析",
    group: "civic",
    accent: "#8b624c",
    strategy: "rss",
    feedPath: "/feed/",
    enabled: true,
  },
  {
    // 2026-11-15 官方 Jobs 列表公开可浏览；/rss.xml 是全站 Updates，不是职位专区 RSS
    id: "reliefweb-jobs",
    family: "other",
    tier: "resource",
    name: "ReliefWeb · 职位",
    url: "https://reliefweb.int/jobs",
    note: "国际公益、人道援助岗位、咨询与合作征集",
    group: "nonprofit",
    accent: "#486f8b",
    strategy: "rss",
    feedPath: "/jobs/rss.xml",
    enabled: true,
  },
  {
    // 2026-11-15 官网展示多国有效征集和资格筛选；/feed.xml 404，官方申请资格与截止日仍需逐条复核
    id: "funding-radar",
    family: "other",
    tier: "resource",
    name: "Funding Radar",
    url: "https://fundingradar.eu/",
    note: "跨国科研项目资助征集与申请资格预筛",
    group: "nonprofit",
    accent: "#617f54",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 公开科研检索与机构关系数据可读；不是经过质量评分的研究证据摘要
    id: "openalex-research",
    family: "other",
    tier: "resource",
    name: "OpenAlex",
    url: "https://openalex.org/",
    note: "全球科研文献、机构、作者与研究关联检索",
    group: "research",
    accent: "#537d9c",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网及 /feed/ 有 11 月政府采购透明度文章；监督线索不等于违法事实
    id: "open-contracting",
    family: "other",
    tier: "resource",
    name: "Open Contracting",
    url: "https://www.open-contracting.org/",
    note: "公共采购透明度、开放合同数据与治理案例",
    group: "civic",
    accent: "#967c45",
    strategy: "rss",
    feedPath: "/feed/",
    enabled: true,
  },
  {
    // 2026-11-15 公开 Atom /atom.xml 含最近研究条目和日期，统计指标不等于地方因果推断
    id: "our-world-in-data",
    family: "other",
    tier: "resource",
    name: "Our World in Data",
    url: "https://ourworldindata.org/",
    note: "公共卫生、教育、贫困与环境的开放数据和研究",
    group: "civic",
    accent: "#70799a",
    strategy: "rss",
    feedPath: "/atom.xml",
    enabled: true,
  },
  {
    // 2026-11-15 官方公开合作征集页有国家、机构、领域及截止日列；申请须登录。
    id: "un-partner-portal",
    family: "other",
    tier: "resource",
    name: "UN Partner Portal · 合作征集",
    url: "https://www.unpartnerportal.org/landing/opportunities/",
    note: "联合国机构合作征集，按国家、领域与申请条件查找",
    group: "nonprofit",
    accent: "#4a869c",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 欧委会官方门户，公共查询与登录申请分开；未核实查询专属 RSS。
    id: "eu-funding-tenders",
    family: "other",
    tier: "resource",
    name: "EU Funding & Tenders · 资助与招标",
    url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home",
    note: "欧盟项目征集、招标与伙伴查找，资格以具体公告为准",
    group: "nonprofit",
    accent: "#576c9e",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 基金委项目指南官方列表可读；列表通知不等于当前仍在受理。
    id: "nsfc-guidelines",
    family: "other",
    tier: "resource",
    name: "国家自然科学基金 · 项目指南",
    url: "https://www.nsfc.gov.cn/p1/3381/2824/zntg.html",
    note: "科研资助指南、申请通知与专项征集，回原公告核对条件",
    group: "nonprofit",
    accent: "#94744c",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网关于页页脚明确标注基于 AIHOT 开源框架。
    id: "aisafetyhot",
    family: "same",
    tier: "official",
    name: "AI Safety HOT",
    url: "https://aisafetyhot.com/",
    note: "AI 安全研究、事件与治理，论文和新闻分开浏览",
    group: "product",
    accent: "#80639c",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网使用规则第六节明确二次开发关系；公开转载须取得同意。
    id: "aidchot",
    family: "same",
    tier: "official",
    name: "AIDC热点",
    url: "https://aidchot.com/",
    note: "AI 数据中心、算力政策与机电运维",
    group: "research",
    accent: "#4a829c",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网关于页明确由 AIHOT 开源框架驱动。
    id: "embhot",
    family: "same",
    tier: "official",
    name: "EmbHot",
    url: "https://embhot.zhcmqtt.top/",
    note: "嵌入式、具身智能、外骨骼与复合材料",
    group: "research",
    accent: "#5d8b6b",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网关于页及页脚注明 Powered by AIHOT。
    id: "markethot",
    family: "same",
    tier: "official",
    name: "MarketHOT",
    url: "https://www.markethot.news/",
    note: "美股公司事件、宏观与行业动态，中英阅读",
    group: "market",
    accent: "#9c754a",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-16 实测 RSS 200 有精选；已从仅浏览升级为邻域 RSS。
    id: "designradar",
    family: "same",
    tier: "official",
    name: "DesignRadar · 设计雷达",
    url: "https://designradar.vercel.app/",
    note: "设计行业精选与 AI 生成界面的评测观察",
    group: "product",
    accent: "#9c637d",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 公开仓库 README 明确医学版关系；GitHub Pages 静态快照非实时服务。
    id: "medhot",
    family: "same",
    tier: "candidate",
    name: "MedHOT",
    url: "https://mrf3247.github.io/medhot/",
    note: "全球医学动态的静态快照，当前页面日期为 2026-11-05",
    group: "health",
    accent: "#598f8c",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 公开仓库 README 明确社科版关系；读取到 2026-11-14 页面。
    id: "thinkhot",
    family: "same",
    tier: "candidate",
    name: "ThinkHOT",
    url: "https://mrf3247.github.io/thinkhot/",
    note: "人文社科与思想动态的静态快照，含心智、语言与历史",
    group: "civic",
    accent: "#94714f",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-16 周报 RSS 200；静态周报发布，不等于逐日更新。
    id: "math-education-hot",
    family: "same",
    tier: "official",
    cadence: "weekly",
    name: "数学教育 HOT",
    url: "https://a0910580996-a11y.github.io/math-education-hot/",
    note: "认知科学、学习科学与 AI 数学教育，静态周报",
    group: "research",
    accent: "#668c70",
    strategy: "rss",
    feedPath: "/math-education-hot/feed.xml",
    enabled: true,
  },
  {
    // 2026-11-16 RSS 200 可读；正式域名 shendeng，仓库拼写不同。
    id: "shendeng-ai",
    family: "same",
    tier: "official",
    overlapPossible: true,
    name: "神灯AI热点",
    url: "https://shendeng.news/",
    note: "AI 综合动态与实用机会，本地采编后发布的静态阅读站",
    group: "news",
    accent: "#46958a",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-16 独立核对官网与 RSS 端点，返回 200 及含日期/链接的条目；非同系站。
    id: "unicef-data",
    family: "other",
    tier: "resource",
    name: "UNICEF Data · 儿童数据",
    url: "https://data.unicef.org/",
    note: "儿童教育、健康、保护和贫困的官方统计与研究",
    group: "health",
    accent: "#4a86a5",
    strategy: "rss",
    feedPath: "/feed/",
    enabled: true,
  },
  {
    // 2026-11-16 独立核对官网与 RSS 端点，返回 200 及含日期/链接的条目；非同系站。
    id: "icnl",
    family: "other",
    tier: "resource",
    name: "ICNL · 非营利法律",
    url: "https://www.icnl.org/",
    note: "非营利组织法律、公民空间与公益政策研究",
    group: "civic",
    accent: "#80658f",
    strategy: "rss",
    feedPath: "/feed/",
    enabled: true,
  },
  {
    // 2026-11-16 独立核对官网与 RSS 端点，返回 200 及含日期/链接的条目；非同系站。
    id: "un-news-sdgs",
    family: "other",
    tier: "official",
    directoryVisible: false,
    name: "联合国新闻 · 可持续发展",
    url: "https://news.un.org/en/",
    note: "联合国可持续发展目标与人道、教育、气候进展",
    group: "nonprofit",
    accent: "#45869b",
    strategy: "rss",
    feedPath: "/feed/subscribe/en/news/topic/sdgs/feed/rss.xml",
    enabled: true,
  },
  {
    // 2026-11-16 独立核对官网与 RSS 端点，返回 200 及含日期/链接的条目；非同系站。
    id: "un-geneva-news",
    family: "other",
    tier: "official",
    directoryVisible: false,
    name: "联合国日内瓦 · 新闻",
    url: "https://www.ungeneva.org/en/news-media",
    note: "联合国人权、公共事务、委员会会议与新闻资料",
    group: "civic",
    accent: "#7385a4",
    strategy: "rss",
    feedPath: "/news-media/press-items-list/rss.xml",
    enabled: true,
  },
  {
    // 2026-11-16 独立核对官网与 RSS 端点，返回 200 及含日期/链接的条目；非同系站。
    id: "gdacs",
    family: "other",
    tier: "resource",
    name: "GDACS · 全球灾害预警",
    url: "https://www.gdacs.org/",
    note: "全球灾害预警与跨国救援事件，源端含 GeoRSS 地理字段，选择首页精简 Feed",
    group: "civic",
    accent: "#b27854",
    strategy: "rss",
    feedPath: "/contentdata/xml/rss_homepage.xml",
    enabled: true,
  },
];

/** 每期条数：日报只是「顺带一看」，周月报可以铺开成一小版。 */
export const PEER_LIMITS = { daily: 3, weekly: 8, monthly: 15 } as const;

/** 版块名与导读文案。改这里不用改渲染代码。 */
export const PEER_SECTION = {
  label: "邻域",
  note: "正式邻域优先提供持续更新的 RSS/API，实用资源提供数据库与机会入口，候选信息供复核；所有内容请回到原始来源核实。",
} as const;
