# 同系邻域继续探索 · 第六轮（2026-11-15）

本轮只扩充可核实的同系站点入口。基线为 main `01d5eaa45dc17cfa3d2822c0eaa02390947cdc3a`，42 项登记，其中 same 24 / other 18。新增 7 项后为 **49 项，same 31 / other 18**；其中仍包含原来关闭的站，不能把登记数当成在线数或生产页面实际数量。

## 找到了什么，怎样核实

| 站点 | 公开入口 | 方向 | 同系证据 | 当日访问结果 |
|---|---|---|---|---|
| AI Safety HOT | https://aisafetyhot.com/ | AI 安全新闻、论文、事件与治理 | [官网关于页](https://aisafetyhot.com/zh/about) 页脚明确「基于 AIHOT 开源框架」 | 公开关于页能读到当日来源动态；有每日论文、热点及 MCP 入口 |
| AIDC热点 | https://aidchot.com/ | 数据中心、算力政策、机电运维 | [使用规则 §6](https://aidchot.com/terms) 明确使用 AIHOT 二次开发 | 首页显示 11 月 15 日精选；§3 要求公开转载或再分发先获同意，因此这里只提供官网链接 |
| EmbHot | https://embhot.zhcmqtt.top/ | 嵌入式、具身智能、外骨骼与复合材料 | [官网关于页](https://embhot.zhcmqtt.top/about) 明确由 AIHOT 开源框架驱动；[作者部署文章](https://developer.cloud.tencent.com/article/2769394) 提供同一域名 | 首页显示 11 月 15 日条目，分类和原文入口可读 |
| MarketHOT | https://www.markethot.news/ | 美股公司事件、宏观与行业情报 | [关于页](https://www.markethot.news/about) 和英文页页脚明确 Powered by AIHOT，并链接上游 | 英文页能读到 11 月 15 日条目；中文站提供公司、宏观等入口 |
| DesignRadar | https://designradar.vercel.app/ | AI 界面设计评测、设计工具及行业精选 | [公开仓库 README](https://github.com/wekobear/designradar) 明确基于 AIHOT 行业定制；仓库 homepage 指向此域名 | 本机匿名 HTTP 200，站名匹配；精选可读到 11 月 13 日内容；RSS 有 42 条 |
| MedHOT | https://mrf3247.github.io/medhot/ | 医学研究、临床药物与公共卫生 | [公开仓库 README](https://github.com/MRF3247/medhot) 明确为 AIHOT 医学版；homepage 指向该 Pages | 本机匿名 HTTP 200，站名匹配；页面日期为 **11 月 5 日**，README 说明是静态快照，不声称实时更新 |
| ThinkHOT | https://mrf3247.github.io/thinkhot/ | 心智意识、社科、历史、语言与伦理 | [公开仓库 README](https://github.com/MRF3247/thinkhot) 明确为 AIHOT 人文社科版；homepage 指向该 Pages | 本机匿名 HTTP 200，站名匹配；页面日期为 **11 月 14 日**，同样属于静态快照 |

同系仅说明公开声明的代码或流程谱系，不是对内容准确性、运营持续性、医学建议或市场判断的背书。只看到页面有某个新闻标题，不能把该新闻当成已经验证的事实。

## 本轮怎样找到，比只看 Fork 多了什么

1. 复查上游 [公开登记 #306](https://github.com/KKKKhazix/AIHOT/discussions/306)、[作品展示](https://github.com/KKKKhazix/AIHOT/discussions/categories/show-and-tell)，与现有 host 和名称去重。两处登记大部分已覆盖，没有把旧站重复计为新增。
2. 从 [AIMAN 展示 #174](https://github.com/KKKKhazix/AIHOT/discussions/174) 的相关项目链接找到 AI Safety HOT，再读其官网页脚确认框架关系。AIMAN 自身仍保持 `other`：社区里发帖不等于证明用了相同代码。
3. 搜索 `"Powered by AIHOT"`、`"AIHOT" "基于"`，发现 MarketHOT 和 AIDC热点；从运营者文章找到 EmbHot，再回官网核实。不是根据名字带 HOT 判断。
4. GitHub 搜索 `"AIHOT" "框架" fork:false` 返回 23 个仓库。这一步能找到 **Use this template、另建仓库或复制后不在 Fork 网络内**的项目。读 README 的明确致谢，接着查仓库 homepage 和 `industry/site.ts` / `site/site.ts`。不能把默认的 `localhost:3000` 当公开地址，也不能把仓库继承的上游 homepage 当自己的站。
5. 对实际地址读取网页标题、正文和日期。公开搜索读取器打不开 DesignRadar、MedHOT、ThinkHOT，但本机标准匿名 HTTP 请求返回 200 并读到匹配内容；此处据实记录验证方式差别。GEOHOT 未能同样验证，因此未混入成功列表。
6. newest Fork API 的连接器路径不受支持；标准匿名 HTTP 能读到最新 100 项元数据，但多数 homepage 继承上游。本轮**没有重跑历史全部 2531 个 Fork 审计**，也没有把这些元数据算成新增运行站。

## RSS 是另一项结论，不因同系就自动接入

- `https://designradar.vercel.app/feed.xml`：标准匿名 HTTP 200，`application/rss+xml`，XML 能解析为 RSS，频道 `DesignRadar — 精选`，42 条；最新样本日期 2026-11-13，保留站内文章链接。本轮仅记录地址，尚未作为主站信源配置。
- `https://evalhot.vercel.app/feed.xml`：HTTP 200、RSS XML 合法，但 **0 条**；首页明确当前没有精选。不能把“接口成功”写成“有内容可同步”。
- MedHOT 和 ThinkHOT 的上述 Pages 路径 `/feed.xml` 均返回 404。README 讲的本地完整服务具备 RSS/API，不等于静态快照部署也有这些出口。
- AIDC热点、EmbHot、MarketHOT、AI Safety HOT 的 `/feed.xml` 被公开读取器识别为 RSS content-type，但它不返回 XML；本机对这些地址返回 403。**识别到 MIME 不等于实际验证条目可解析**，不设置 RSS/API 策略，不更换身份绕过拦截。

因此 7 家均为 `family=same, strategy=link, enabled=true`，沿用现有行业分组和「仅浏览」卡片。`refreshPeers` 不发外部请求、不写采集状态，也不进入日报文章轮转；不增加 `industry/sources.json` Seed，不开启模型、采集、推送或全文转载开关。后续单站启用 RSS 要另外核对授权范围、实际数据、去重、相关性与预算。

## 另有 11 个候选，保留线索但不冒充运行站

| 项目 | 方向 | 尚未纳入可浏览目录的原因 |
|---|---|---|
| [EvalHot](https://github.com/youngfreeFJS/evalhot) | 模型评测与榜单 | homepage `https://evalhot.vercel.app/` 在线，但首页无精选、RSS 为 0 条，待有实际内容后复查 |
| [GEOHOT](https://github.com/xxc2007/GeoHot) | 地理与地球观测 | README 明写在线地址 `https://xxc2007.me/geohot/`，但本机 HTTP 403、公开读取器也失败；只能写「本轮未验证可访问」，不能断言网站已停运 |
| [教育HOT](https://github.com/ganguoqing1991/edu-hot) | 教育政策、升学、机构与舆情 | 定制 README 与行业配置明确，未核实独立公开地址 |
| [MedTechHOT](https://github.com/benjaminxu2023-glitch/MedTechHOT) | 医疗器械 | README 明确行业定制，未核实独立公开地址 |
| [LifeSciHOT](https://github.com/zentnertrench-design/lifescihot) | 生命科学 | 配置有独立站名，未核实独立公开地址；不把模板 README 视为运行证明 |
| [RSHOT](https://github.com/MoChiUaena/RSHOT) | 遥感、EO 与 GeoAI | README 明确二次开发与行业配置，未核实独立公开地址 |
| [PrecisionAGHOT](https://github.com/ives-cheung/PrecisionAGHOT) | 精准农业与农机 | README 明确农业定制，展示的是本地实例，未核实公开地址 |
| [KuajingHot](https://github.com/ecoyoung/kuajinghot) | 跨境电商 | README 明确框架来源，配置只给 localhost，未核实公开地址 |
| [OpenHot](https://github.com/reisen-ww/OpenHot) | 开源动态 | 站点配置给出独立名称与本地端口，未核实公开地址 |
| [CustomsHOT](https://github.com/yak33/customs-hot) | 关务与贸易合规 | 定制 README 与配置可读，未核实公开地址 |
| [蚊媒传染病热点](https://github.com/ZBOY0608/vector-borne-disease-hot) | 蚊媒传染病文献 | 定制 README 与配置可读，未核实公开地址 |

另发现 [aihot-to-x](https://github.com/Yuriloll/aihot-to-x) 明确为基于公开 API 的第三方 X 草稿 Skill；这是工具衍生，不是另一个行业站，因此不塞进邻域站点数。搜索索引还提到旧域名和 `/api/public/*`，需要单独核对迁移，不能直接安装运行或自动发帖。

## 验证、部署与回滚

- 本地运行 `npm run typecheck`、`node --test tests/peers.test.ts`；先 `npm run build -w @aihot/web`，再执行 Web Tests。7 家新条目复用已有 link 策略；回归测试将 `globalThis.fetch` 设为抛错，验证每家 `fetchPeer` 仍返回 `{via: "none", items: [], error: null}`，不联网、不建立 RSS Seed。
- 本地已通过：typecheck、23 项邻域测试、Web build、30 项 Web Tests；合成 API 加真实构建 SSR 返回 HTTP 200，48 个启用目录条目中 7 个新链接全部存在，两类分组与静态快照说明可读。该合成页面验证不是腾讯云或第三方网站的运行验收。
- 合并前等待 GitHub 的完整 Check、Docker smoke 等必须通过。只提交本轮四个文件，保留并发 main 的信源关键字变更，不把本地较早快照覆盖回去。
- GitHub 合并不等于腾讯云部署。需要单独重建并部署 API/worker，再检查 `/peers` 同系分组、静态快照说明和官网链接；本轮没有触碰腾讯云。
- 回滚删除这 7 个 PeerSite 和对应回归断言即可；没有数据库迁移、付费请求或采集状态需要清理。此文件保留为历史发现证据。
