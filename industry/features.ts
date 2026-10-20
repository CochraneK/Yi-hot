// 可选模块。它们只对 AI 行业有意义：做别的行业时两项都设为 false，或者按 docs/customize.md 整块删掉。
// 关掉以后：导航里不再出现入口，对应的定时任务不再运行，页面与接口返回 404。

export const FEATURES = {
  /** 暂时隐藏独立精选栏目；精选判定、标签、RSS 和公开 API 继续保留。 */
  selectedFeed: false,
  /** 公益总报只生成周报、月报；旧日报保留为历史记录。 */
  dailyReports: false,
  dailyNewsletter: true,
  /** 模型榜：汇总公开评测，按公开方法 v15 计算共识排名（/leaderboard）。每天抓 4 次评测来源。公益行业无此需求。 */
  leaderboard: false,
  /** Codex 重置监控：盯 OpenAI Codex 负责人在 X 上的额度重置公告（/codex-reset）。需要 SocialData。公益行业无此需求。 */
  codexResetMonitor: false,
  /** 监管记录：民政部行政处罚与全国社会组织活动异常名录 / 严重违法失信名单公告（/records）。每天同步一次。 */
  regulatoryRecords: true,
} as const;
