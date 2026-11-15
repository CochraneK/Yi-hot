// 「邻域」跨行业站点目录，不等于 YiHot 主站的信息源。
// 有些来自 AIHOT 框架，也有单独的专题/演示站，不能宣称全部使用相同技术栈。
//
// 两条准入路径（2026-11-15 公开网站实测）：
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
export type PeerFamily = "same" | "other";

export interface PeerSite {
  id: string;
  name: string;
  /** 展示归属：同系邻域 / 其他邻域，与行业 group 正交。 */
  family: PeerFamily;
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
 * 组的顺序就是页面的呈现顺序，沿用 PEER_SITES 的取舍：先和公益读者最近的（健康、公共），
 * 再到技术、通用 AI 资讯、商业。**组只增不改名**——改标签不需要动代码，但一次改名会让老读者
 * 找不到原来的位置。
 *
 * 一条硬约束：不要为了一家站单开一个组。一个组里只有一张卡时，分组反而比不分组更空。
 */
export type PeerGroupId = "health" | "public" | "tech" | "ai" | "biz";

export const PEER_GROUPS: { id: PeerGroupId; label: string; note: string }[] = [
  { id: "health", label: "健康与生命", note: "心理、精神医学与生物医药" },
  { id: "public", label: "公共与环境", note: "环境、城市与公共事务" },
  { id: "tech", label: "技术与安全", note: "工程、研究与漏洞情报" },
  { id: "ai", label: "综合 AI 资讯", note: "不限行业，什么都谈" },
  { id: "biz", label: "商业与职场", note: "公司、营销与跨境" },
];

/** 分不出来的时候统一落在这里，页面不会因为某个站漏填 group 就整块消失。 */
export const PEER_GROUP_FALLBACK = { id: "other", label: "其他", note: "还没归类" } as const;

/** 姊妹站清单。enabled=false 的仍显示在后台状态里，便于知道「为什么这一家没内容」。 */
export const PEER_SITES: PeerSite[] = [
  {
    id: "psyhot",
    family: "same",
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
    name: "URHOT",
    url: "https://huangzhenhao90.github.io/ai-ux-research-hot/",
    note: "AI × 用户研究，HCI 方法、工具与设计研究",
    group: "tech",
    accent: "#775a83",
    strategy: "rss",
    feedPath: "/ai-ux-research-hot/rss.xml",
    enabled: true,
  },
  {
    // 2026-11-15 核实行业日报和招投标雷达，/feed.xml 为 404，仅浏览。
    id: "sanyu-insights",
    family: "other",
    name: "三禹智能 · 行业情报",
    url: "https://www.sanyusmart.com/insights/",
    note: "智慧水利、行业 AI、招投标商机",
    group: "public",
    accent: "#648a62",
    strategy: "link",
    enabled: true,
  },
  {
    id: "qingyan",
    family: "same",
    name: "青砚",
    url: "https://qingyannews.cn",
    note: "环保与双碳",
    group: "public",
    accent: "#2f7a55",
    strategy: "api",
    enabled: true,
  },
  {
    // 扫 fork 的 site/site.ts 找到（nidao003/AIHOT-metro），2026-11-15 实测 /api/v1/items 标准、
    // feed.xml 可用。城轨是名录里第一个公共基础设施方向。
    id: "metrohot",
    family: "same",
    name: "MetroHot",
    url: "https://metrohot.oohforce.com",
    note: "城市轨道交通，地铁运营、TOD 开发与站点商业",
    group: "public",
    accent: "#4a8a7a",
    strategy: "api",
    enabled: true,
  },
  {
    // #306 登记，2026-11-15 实测 /api/v1/items 标准、feed.xml 可用。
    id: "bioinfosoul",
    family: "same",
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
    name: "GameHOT",
    url: "https://gamehot.org/",
    note: "游戏产业、产品设计、发行运营与玩家反馈",
    group: "biz",
    accent: "#a05b57",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 核实 /feed.xml 有财经及产业精选，独立站而非 aihot.news。
    id: "myhot-finance",
    family: "same",
    name: "MyHOT · 市场观察",
    url: "https://aihot.wscn.net/",
    note: "金融市场、产业政策与商业动态",
    group: "biz",
    accent: "#867449",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 核实公开产品/融资分析页，但 /feed.xml 为 404，仅浏览。
    id: "xocto",
    family: "other",
    name: "x-octo · 机会库",
    url: "https://xocto.vercel.app/",
    note: "AI 产品研究、融资与创业机会（公开资料库）",
    group: "biz",
    accent: "#5d8572",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 核实公开趋势页，后台登录限制；/feed.xml、/rss.xml 为 404。
    id: "aimfast",
    family: "other",
    name: "AimFast",
    url: "https://www.aimfast.dev/",
    note: "创业趋势与产品机会（深入分析需登录）",
    group: "biz",
    accent: "#4c8b91",
    strategy: "link",
    enabled: true,
  },
  {
    id: "innews",
    family: "same",
    name: "大厂观察",
    url: "https://innews.site",
    note: "互联网大厂动态与职场信息",
    group: "biz",
    accent: "#b2562c",
    strategy: "api",
    enabled: true,
  },
  {
    id: "sevenailab",
    family: "same",
    name: "品牌AI外刊",
    url: "https://news.sevenailab.com",
    note: "海外品牌营销与 AI 带来的变化",
    group: "biz",
    accent: "#744a8e",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 核实：/robot-hot/feed.xml 可读；/robot-hot/rss.xml 不存在。
    id: "aiman-robot-hot",
    family: "other",
    name: "聚身之家",
    url: "https://www.aiman.world/robot-hot/",
    note: "具身智能，机器人产业、研究与产品证据",
    group: "tech",
    accent: "#397680",
    strategy: "rss",
    feedPath: "/robot-hot/feed.xml",
    enabled: true,
  },
  {
    id: "robohot",
    family: "same",
    name: "RoboHot",
    url: "https://robohot.news",
    note: "机器人产业，面向研发者与准备入行的人",
    group: "tech",
    accent: "#2a7480",
    strategy: "api",
    enabled: true,
  },
  {
    id: "mediastack",
    family: "same",
    name: "MediaStack",
    url: "https://mediastack.work",
    note: "音视频技术情报",
    group: "tech",
    accent: "#2f6390",
    strategy: "api",
    enabled: true,
  },
  {
    id: "filmtech",
    family: "same",
    name: "FilmTechNews",
    url: "https://filmtech.lumenghe.com",
    note: "影视技术日报",
    group: "tech",
    accent: "#8f3a44",
    strategy: "api",
    enabled: true,
  },
  {
    id: "ai4math",
    family: "same",
    name: "AI4Math Radar",
    url: "https://charlie-wang-03.github.io/ai4math-radar/",
    note: "AI for Mathematics 研究动态",
    group: "tech",
    accent: "#3f7a3f",
    strategy: "rss",
    enabled: true,
  },
  {
    // 扫 fork 的 site/site.ts 找到（TJJAom/AIHOT），2026-11-15 实测 /api/v1/items 标准。
    // 名录里第一家用繁体中文写作的站，条目里会出现「輝達」「軟體」这类译名。
    id: "dayacre",
    family: "same",
    name: "日耕 AI 熱點",
    url: "https://aihot.dayacre.com",
    note: "AI 动态的繁中版，台湾读者的用语与视角",
    group: "ai",
    accent: "#9a5a9a",
    strategy: "api",
    enabled: true,
  },
  {
    // #254 登记，2026-11-15 实测 /api/v1/items 标准。
    id: "foxnan",
    family: "same",
    name: "AI快讯",
    url: "https://hot.foxnan.com",
    note: "AI 新闻与每日动态",
    group: "ai",
    accent: "#2f7fa8",
    strategy: "api",
    enabled: true,
  },
  {
    // #98 登记，只有 Atom feed（/api/v1/* 全 404），feed 的 entry link 直接是原文地址。
    id: "xabcnews",
    family: "same",
    name: "XABC News",
    url: "https://xabcnews.com",
    note: "AI、开发者与前沿科技的全网热点",
    group: "ai",
    accent: "#8a6a2a",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 实测 /api/v1/items 标准，方向是漏洞情报。
    id: "vulnhot",
    family: "same",
    name: "VulnHOT",
    url: "https://vulnhot.com",
    note: "漏洞情报与安全事件",
    group: "tech",
    accent: "#8c3a72",
    strategy: "api",
    enabled: true,
  },
  {
    // 域名 2026-11-15 实测已失效：news.blues19.com 与 apex blues19.com 都无 A 记录。
    // 仍然保留在表里并继续探测（DNS 失败只需 1ms），站主恢复解析后自动接上。
    id: "blues19",
    family: "same",
    name: "拾玖跨境资讯",
    url: "https://news.blues19.com",
    note: "跨境电商，按平台政策与运营重建了主题体系",
    group: "biz",
    accent: "#5a4a9e",
    strategy: "api",
    enabled: true,
  },
  {
    // 实测 /feed.xml、/rss.xml、/api/v1/* 全 404（Next.js 站，接口未导出）。
    id: "yingxiao",
    family: "same",
    name: "营销通鉴 · 平台动态",
    url: "https://yingxiaoclub.com/news",
    note: "营销平台的规则变化与新功能早报",
    group: "biz",
    accent: "#7a7a72",
    strategy: "none",
    enabled: false,
  },
  {
    // 2026-11-15 实测主页与 /feed.xml，汽车新闻有实际更新时间。
    id: "autohot",
    family: "same",
    name: "AutoHot",
    url: "https://www.autohot.top/",
    note: "汽车产业、新车型、出行技术与政策",
    group: "public",
    accent: "#526fa2",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 实测主页与 /feed.xml，住房/物业有近期政策信息。
    id: "huifangyun",
    family: "same",
    name: "汇房云资讯",
    url: "https://info.huifangyun.com/",
    note: "房地产、物业监管、住房与社区服务",
    group: "public",
    accent: "#907248",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 实测 /feed.xml 和 /api/v1/items 返回实际文章。
    id: "fai-lab",
    family: "same",
    name: "FAI 实验室",
    url: "https://fai.fashion/",
    note: "AI 工具、设计与内容生产，也有通用 AI 资讯",
    group: "tech",
    accent: "#7a6177",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 公开材料/化学研究条目可读；/ai4scihot/feed.xml 返回 403。
    id: "ai4scihot",
    family: "same",
    name: "AI4SciHOT",
    url: "https://ai4scihot.8-220-189-127.sslip.io/ai4scihot",
    note: "AI for Science：材料、化学、物理与工业仿真",
    group: "tech",
    accent: "#5c7b65",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 公开专题可浏览；/feed.xml 和 /horizon/feed.xml 为 404。
    // 这是 UU AI Hub 专题，不是独立运行的「发射窗口」AIHOT 服务。
    id: "horizon-uu",
    family: "other",
    name: "发射窗口",
    url: "https://www.uuaihub.com/horizon",
    note: "商业航天、AI 芯片与机器人专题入口",
    group: "tech",
    accent: "#8b704b",
    strategy: "link",
    enabled: true,
  },
  {
    // AIHOT Show and tell #333，2026-11-15 实测：仅为静态演示页。
    id: "fengxiang-demo",
    family: "same",
    name: "风向",
    url: "https://fightkk7.github.io/fengxiang/",
    note: "企业服务与 SaaS 资讯（静态产品演示）",
    group: "biz",
    accent: "#96724d",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 公共站可浏览，/feed.xml 与 /rss.xml 均为 404。
    id: "newsiq",
    family: "other",
    name: "NewsIQ · 讯析",
    url: "https://newsiq.xyz/",
    note: "新闻事件聚合与跨来源分析",
    group: "ai",
    accent: "#4e7290",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 核实 /feed.xml 有当日多源研究条目；与已有 AI 热点站功能部分交叉。
    id: "ai-pulse-lab",
    family: "other",
    name: "AI Pulse",
    url: "https://ai-pulse-lab.com/",
    note: "多源 AI 信号、研究分析与知识检索",
    group: "ai",
    accent: "#5c6b8d",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 官网有 NGO 招聘与公益资源；/feed.xml 和 /rss.xml 均未提供可用内容
    id: "cdb-ngo",
    family: "other",
    name: "中国发展简报",
    url: "https://www.chinadevelopmentbrief.org.cn/",
    note: "公益招聘、资助招标、机构动态与专业培训",
    group: "public",
    accent: "#4b7a67",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 新闻公开可读；近期条目到 2026-06；没有经核实的稳定 RSS，不能声称每日更新
    id: "foundation-center",
    family: "other",
    name: "基金会中心网",
    url: "https://foundationcenter.org.cn/news",
    note: "基金会信息披露、慈善数据与合规研究",
    group: "public",
    accent: "#627993",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网及 WordPress /feed/ 实测有 2026-11 更新；政策解释非官方版本
    id: "china-law-translate",
    family: "other",
    name: "China Law Translate",
    url: "https://www.chinalawtranslate.com/",
    note: "中国法律政策的非官方翻译、修法跟踪与分析",
    group: "public",
    accent: "#8b624c",
    strategy: "rss",
    feedPath: "/feed/",
    enabled: true,
  },
  {
    // 2026-11-15 官方 Jobs 列表公开可浏览；/rss.xml 是全站 Updates，不是职位专区 RSS
    id: "reliefweb-jobs",
    family: "other",
    name: "ReliefWeb · 职位",
    url: "https://reliefweb.int/jobs",
    note: "国际公益、人道援助岗位、咨询与合作征集",
    group: "biz",
    accent: "#486f8b",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网展示多国有效征集和资格筛选；/feed.xml 404，官方申请资格与截止日仍需逐条复核
    id: "funding-radar",
    family: "other",
    name: "Funding Radar",
    url: "https://fundingradar.eu/",
    note: "跨国科研项目资助征集与申请资格预筛",
    group: "tech",
    accent: "#617f54",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 公开科研检索与机构关系数据可读；不是经过质量评分的研究证据摘要
    id: "openalex-research",
    family: "other",
    name: "OpenAlex",
    url: "https://openalex.org/",
    note: "全球科研文献、机构、作者与研究关联检索",
    group: "tech",
    accent: "#537d9c",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 官网及 /feed/ 有 11 月政府采购透明度文章；监督线索不等于违法事实
    id: "open-contracting",
    family: "other",
    name: "Open Contracting",
    url: "https://www.open-contracting.org/",
    note: "公共采购透明度、开放合同数据与治理案例",
    group: "public",
    accent: "#967c45",
    strategy: "rss",
    feedPath: "/feed/",
    enabled: true,
  },
  {
    // 2026-11-15 公开 Atom /atom.xml 含最近研究条目和日期，统计指标不等于地方因果推断
    id: "our-world-in-data",
    family: "other",
    name: "Our World in Data",
    url: "https://ourworldindata.org/",
    note: "公共卫生、教育、贫困与环境的开放数据和研究",
    group: "public",
    accent: "#70799a",
    strategy: "rss",
    feedPath: "/atom.xml",
    enabled: true,
  },
  {
    // 2026-11-15 官方公开合作征集页有国家、机构、领域及截止日列；申请须登录。
    id: "un-partner-portal",
    family: "other",
    name: "UN Partner Portal · 合作征集",
    url: "https://www.unpartnerportal.org/landing/opportunities/",
    note: "联合国机构合作征集，按国家、领域与申请条件查找",
    group: "public",
    accent: "#4a869c",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 欧委会官方门户，公共查询与登录申请分开；未核实查询专属 RSS。
    id: "eu-funding-tenders",
    family: "other",
    name: "EU Funding & Tenders · 资助与招标",
    url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home",
    note: "欧盟项目征集、招标与伙伴查找，资格以具体公告为准",
    group: "public",
    accent: "#576c9e",
    strategy: "link",
    enabled: true,
  },
  {
    // 2026-11-15 基金委项目指南官方列表可读；列表通知不等于当前仍在受理。
    id: "nsfc-guidelines",
    family: "other",
    name: "国家自然科学基金 · 项目指南",
    url: "https://www.nsfc.gov.cn/p1/3381/2824/zntg.html",
    note: "科研资助指南、申请通知与专项征集，回原公告核对条件",
    group: "tech",
    accent: "#94744c",
    strategy: "link",
    enabled: true,
  },
];

/** 每期条数：日报只是「顺带一看」，周月报可以铺开成一小版。 */
export const PEER_LIMITS = { daily: 3, weekly: 8, monthly: 15 } as const;

/** 版块名与导读文案。改这里不用改渲染代码。 */
export const PEER_SECTION = {
  label: "邻域",
  note: "邻域汇集不同领域的公开信息站、研究数据库和行业工具。可同步文章来自原站，其他仅提供浏览入口；任何观点、数据与建议均需回到原始来源核实。",
} as const;
