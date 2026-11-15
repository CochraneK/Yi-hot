// 「邻域」版块的姊妹站登记表。
//
// 这些都是用同一套 AIHOT 框架做出来的行业站（不是我们的信源）。它们的 /api/v1 是公开的长期接口，
// 条目在它们那边已经过编辑系统筛选、打分、写过入选理由，所以这里**不调用任何模型**：读回来直接用。
//
// 三条准入（2026-11-15 逐站实测，`curl -m 15`）：
//   1. 必须有机器可读出口（标准 /api/v1 接口，或至少 RSS）；
//   2. 条目能拿到 标题 + 摘要 + 一个可回溯的链接；
//   3. 站点活着。
// 只有 2 没有 1 的站留在表里但 strategy 标记为 "none"，避免每天空跑；恢复出口时改一个字段即可。
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
export interface PeerSite {
  id: string;
  name: string;
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
   * none = 目前没有任何机器可读出口
   */
  strategy: "api" | "rss" | "none";
  /** RSS-only sites may publish on /rss.xml or in a subdirectory instead of /feed.xml. */
  feedPath?: string;
  enabled: boolean;
}

/** 姊妹站清单。enabled=false 的仍显示在后台状态里，便于知道「为什么这一家没内容」。 */
export const PEER_SITES: PeerSite[] = [
  {
    id: "psyhot",
    name: "PsyHOT",
    url: "https://psyhot.cn",
    note: "心理学与精神医学，学界与业界双视角",
    accent: "#4a5a9c",
    strategy: "api",
    enabled: true,
  },
  {
    // 2026-11-15 复核：/ai-ux-research-hot/rss.xml 有真实 2026-11 条目；旧 /URHOT/ 是 404。
    id: "urhot",
    name: "URHOT",
    url: "https://huangzhenhao90.github.io/ai-ux-research-hot/",
    note: "AI × 用户研究，HCI 方法、工具与设计研究",
    accent: "#775a83",
    strategy: "rss",
    feedPath: "/ai-ux-research-hot/rss.xml",
    enabled: true,
  },
  {
    id: "qingyan",
    name: "青砚",
    url: "https://qingyannews.cn",
    note: "环保与双碳",
    accent: "#2f7a55",
    strategy: "api",
    enabled: true,
  },
  {
    // 扫 fork 的 site/site.ts 找到（nidao003/AIHOT-metro），2026-11-15 实测 /api/v1/items 标准、
    // feed.xml 可用。城轨是名录里第一个公共基础设施方向。
    id: "metrohot",
    name: "MetroHot",
    url: "https://metrohot.oohforce.com",
    note: "城市轨道交通，地铁运营、TOD 开发与站点商业",
    accent: "#4a8a7a",
    strategy: "api",
    enabled: true,
  },
  {
    // #306 登记，2026-11-15 实测 /api/v1/items 标准、feed.xml 可用。
    id: "bioinfosoul",
    name: "生信之灵",
    url: "https://bioinfosoul.com",
    note: "生信与 AI 制药，科研进展与临床审批",
    accent: "#5f7d2a",
    strategy: "api",
    enabled: true,
  },
  {
    id: "innews",
    name: "大厂观察",
    url: "https://innews.site",
    note: "互联网大厂动态与职场信息",
    accent: "#b2562c",
    strategy: "api",
    enabled: true,
  },
  {
    id: "sevenailab",
    name: "品牌AI外刊",
    url: "https://news.sevenailab.com",
    note: "海外品牌营销与 AI 带来的变化",
    accent: "#744a8e",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 复核：聚身之家位于 /robot-hot；/robot-hot/feed.xml 已更新；
    // /robot-hot/rss.xml 和 /api/v1/items 不存在，不要按根 /feed.xml 猜地址。
    id: "aiman-robot-hot",
    name: "聚身之家",
    url: "https://www.aiman.world/robot-hot/",
    note: "具身智能，机器人产业、研究与产品证据",
    accent: "#397680",
    strategy: "rss",
    feedPath: "/robot-hot/feed.xml",
    enabled: true,
  },
  {
    id: "robohot",
    name: "RoboHot",
    url: "https://robohot.news",
    note: "机器人产业，面向研发者与准备入行的人",
    accent: "#2a7480",
    strategy: "api",
    enabled: true,
  },
  {
    id: "mediastack",
    name: "MediaStack",
    url: "https://mediastack.work",
    note: "音视频技术情报",
    accent: "#2f6390",
    strategy: "api",
    enabled: true,
  },
  {
    id: "filmtech",
    name: "FilmTechNews",
    url: "https://filmtech.lumenghe.com",
    note: "影视技术日报",
    accent: "#8f3a44",
    strategy: "api",
    enabled: true,
  },
  {
    id: "ai4math",
    name: "AI4Math Radar",
    url: "https://charlie-wang-03.github.io/ai4math-radar/",
    note: "AI for Mathematics 研究动态",
    accent: "#3f7a3f",
    strategy: "rss",
    enabled: true,
  },
  {
    // 扫 fork 的 site/site.ts 找到（TJJAom/AIHOT），2026-11-15 实测 /api/v1/items 标准。
    // 名录里第一家用繁体中文写作的站，条目里会出现「輝達」「軟體」这类译名。
    id: "dayacre",
    name: "日耕 AI 熱點",
    url: "https://aihot.dayacre.com",
    note: "AI 动态的繁中版，台湾读者的用语与视角",
    accent: "#9a5a9a",
    strategy: "api",
    enabled: true,
  },
  {
    // #254 登记，2026-11-15 实测 /api/v1/items 标准。
    id: "foxnan",
    name: "AI快讯",
    url: "https://hot.foxnan.com",
    note: "AI 新闻与每日动态",
    accent: "#2f7fa8",
    strategy: "api",
    enabled: true,
  },
  {
    // #98 登记，只有 Atom feed（/api/v1/* 全 404），feed 的 entry link 直接是原文地址。
    id: "xabcnews",
    name: "XABC News",
    url: "https://xabcnews.com",
    note: "AI、开发者与前沿科技的全网热点",
    accent: "#8a6a2a",
    strategy: "rss",
    enabled: true,
  },
  {
    // 2026-11-15 实测 /api/v1/items 标准，方向是漏洞情报。
    id: "vulnhot",
    name: "VulnHOT",
    url: "https://vulnhot.com",
    note: "漏洞情报与安全事件",
    accent: "#8c3a72",
    strategy: "api",
    enabled: true,
  },
  {
    // 域名 2026-11-15 实测已失效：news.blues19.com 与 apex blues19.com 都无 A 记录。
    // 仍然保留在表里并继续探测（DNS 失败只需 1ms），站主恢复解析后自动接上。
    id: "blues19",
    name: "拾玖跨境资讯",
    url: "https://news.blues19.com",
    note: "跨境电商，按平台政策与运营重建了主题体系",
    accent: "#5a4a9e",
    strategy: "api",
    enabled: true,
  },
  {
    // 实测 /feed.xml、/rss.xml、/api/v1/* 全 404（Next.js 站，接口未导出）。
    id: "yingxiao",
    name: "营销通鉴 · 平台动态",
    url: "https://yingxiaoclub.com/news",
    note: "营销平台的规则变化与新功能早报",
    accent: "#7a7a72",
    strategy: "none",
    enabled: false,
  },
];

/** 每期条数：日报只是「顺带一看」，周月报可以铺开成一小版。 */
export const PEER_LIMITS = { daily: 3, weekly: 8, monthly: 15 } as const;

/** 版块名与导读文案。改这里不用改渲染代码。 */
export const PEER_SECTION = {
  label: "邻域",
  note: "以下条目来自同框架的姊妹站，由它们各自的编辑系统筛选，不是本报的判断；标题可直达原站，署名与原文链接一并保留。",
} as const;
