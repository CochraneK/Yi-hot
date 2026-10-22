// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "Yi-Hot",
  /**
   * 行业词：拼进默认说法里，比如“AI 日报”“AI 动态”。
   * 改成“法律”“HR”“黄金”之类，页面上就会变成“法律日报”“法律动态”。
   */
  subject: "公益",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "Yi-Hot — 公益行业动态与公益总报",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "自动盯住公益行业信源，用模型摘要、打分、精选，把同一件事的多篇报道归到一起，每周、每月生成公益总报。",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "值得关注的公益动态",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-CN",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 myhot_get_latest、myhot_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "yihot",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。 */
  footerNote: "公益动态聚合站",
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在页脚并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "Yi-Hot",
    /** 创始人（选填）：{ name, url, description }。 */
    founder: null as null | { name: string; url?: string; description?: string },
  },
  /** 抓取信源时报上的名字（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "YiHotBot",
} as const;

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `关于 ${SITE.name}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["公益行业每天都有新动静，", "值得看的，只有几条。"] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数。 */
  lead: `${SITE.name} 替你盯着 {sources} 个信源：抓取、归并、打分、精选，每周、每月生成公益总报。免费，不用注册。`,
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "官方博客、媒体、X 账号、公众号和各类订阅源都在看；活跃的源 15 分钟就看一次。",
    store: "抓到的都存下来，同一件事的报道归到一起；只计入热度的账号也算在内，热点榜就是从这里算出来的。",
    select: "模型先看是不是这个行业的事、有没有实际信息，再写中文标题、摘要和推荐理由；营销稿和重复转发进不来。",
    publish: "公益总报每周一出周报，每月 1 日出月报；最精选的几条可以推到飞书群。",
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 industry/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: null as null | {
    name: string;
    greeting: string[];
    avatarSourceId?: string | null;
    wechat?: { title: string; note: string };
    feishu?: { title: string; note: string };
  },
  /**
   * 「关于」页结尾那一屏（选填，null 就不显示）：机构介绍 + 公众号二维码。
   * 写法按「关于我们」——讲这个机构是谁、在哪、做什么，不解释数据是怎么算出来的；
   * 数据报告只留一条次级入口（report）。机构事实以公众号招聘文末的「机构介绍」为准，
   * 报告重跑后涉及的数字要回来对一次。二维码用后台「设置」里的公众号码，没设就只显示文字。
   */
  account: {
    kicker: "关于我们",
    headline: "我们坚信每个孩子都值得拥有一个更美好的未来",
    lead: [
      "救助儿童会 1919 年成立于英国，是全球领先的、独立的儿童慈善组织，今天有 25,000 余名员工在 125 个国家工作。",
      "20 世纪 80 年代我们进入中国，从安徽、云南、西藏起步；2013 年成为在民政部注册的境外基金会代表处之一，2017 年依法登记为境外非政府组织在华代表机构。现在，我们在中国 12 个省、自治区和直辖市开展儿童福利与保护、救灾、教育、健康、儿童权益方面的工作。",
      "我们的愿景是所有儿童都能享有生存、健康、受教育、被保护以及参与世界的权利。",
    ] as string[],
    figures: [
      { value: "1919", label: "成立于英国" },
      { value: "125", label: "个国家开展工作" },
      { value: "25,000+", label: "名全球员工" },
      { value: "12", label: "个省区市有项目" },
    ],
    report: { href: "/about/dashboard", label: "看看这十二年写过什么" },
    /**
     * 机构官网（选填）：放在数字下面的一行小字链接。
     * 只能用 http：这个域名 443 端口不响应（本机与服务器实测 https 返回 000，http 返回 200），
     * 公众号文末给的也是 http 链接。哪天它开了 https 再改回来，改之前先 curl 一次。
     */
    site: { label: "救助儿童会官网", href: "http://www.savethechildren.org.cn/" },
    qr: { title: "扫码关注公众号", note: "项目进展、一线故事和研究报告，都会先发在这里。" },
  } as null | {
    kicker: string;
    headline: string;
    /** 一段话，或者几段话（一段一条，页面上分开排）。 */
    lead: string | string[];
    figures: Array<{ value: string; label: string }>;
    report: { href: string; label: string };
    site?: { label: string; href: string };
    qr: { title: string; note: string };
  },
  /** 页面底部的版权与下架说明（结尾会接“反馈页”的链接）。 */
  copyright: `${SITE.name} 是聚合摘要和阅读索引，原文版权归各来源所有。如果你是来源方，希望更正、下架或调整展示方式，可以通过`,
} as const;

/** “AI 日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}
