# 同系邻域第七轮：周报与静态阅读站（2026-11-15）

基线 main `8bc764ec4e60c5638409771b8545597d330ecb64`。本轮从 49 项邻域（same 31 / other 18，含原有关闭项）新增 2 家明确同系且可公开阅读的站，成为 **51 项，same 33 / other 18**。登记数不是生产在线数。

## 新增两家

| 站点与官网 | 方向与实际形态 | 同系关系依据 | 2026-11-15 读取证据 |
|---|---|---|---|
| [数学教育 HOT](https://a0910580996-a11y.github.io/math-education-hot/) | 认知科学、学习科学与 AI 数学教育；静态周报，非实时资讯服务 | [作者 README](https://github.com/a0910580996-a11y/math-education-hot) 明写基于 AIHOT 制作静态发行版，采用本地每周编辑任务；未部署原版服务端 | 标准匿名 HTTP 200，标题「数学教育 HOT · 每周精选」，周报索引最新为 11 月 9 日第 6 期；有原始论文与研究来源链接。RSS XML 解析为 `rss`，12 个 item |
| [神灯AI热点](https://shendeng.news/) | AI 综合动态与实用机会；本地采编、静态导出阅读站 | [作者 README](https://github.com/littleweb/shengdeng.news) 与 [运行说明](https://github.com/littleweb/shengdeng.news/blob/main/docs/shengdeng.md) 明确沿用 AIHOT 页面与采编引擎 | 公开网页可读 11 月 15 日精选；标准匿名 RSS HTTP 200，XML 解析为 `rss`，50 个 item，样本日期为当日 |

神灯的正式域名是 **shendeng.news**，仓库名是 **shengdeng.news**，作者专门说明这个差异是已确认的安排；不擅自把网址改成与仓库名一致。同系关系依据代码/作者声明，不凭站名带 HOT 推断；两站文章中的研究结果与新闻标题仍是来源观点，本轮没有逐条复核。

## RSS 已实测，接入状态仍独立

| 站点 | 已验证 RSS | 本轮配置 |
|---|---|---|
| 数学教育 HOT | https://a0910580996-a11y.github.io/math-education-hot/feed.xml | 仅记录地址，不新增主站 Seed |
| 神灯AI热点 | https://shendeng.news/feed.xml | 仅记录地址，不新增主站 Seed |

两个目录条目均为 `family=same, strategy=link, enabled=true`，复用已有卡片，不自动采集、不进入文章轮转，不增加模型调用或生产数据。数学教育归「技术与安全」的研究方向，神灯归「综合 AI 资讯」。技术可读、代码开源和站内内容的公开转载许可分别核实；本轮只提供原站入口，不导入其文章。

静态站不等于完整动态站：作者写明的本地 API/MCP 能力，不能直接套到导出的静态域名上。神灯的部署说明明确某些在线交互不提供，本轮不宣称那些能力已接通。

## 搜索怎样继续扩展，避免重复与虚增

- GitHub 搜索扩展到 `AIHOT in:readme fork:false`，再加 `"industry/"`、`"行业"` 分页查找。关键词只生成候选，不能证明一个项目已定制或公开运行。
- 第一批优先读取 35 个候选，第二批 22 个行业候选；补读关联作者的 RoboTaxi 与神灯，以及 ElectroRadar。去重后的 **58 条仓库核验记录**保存在 [机器可读清单](data/peer-discovery-round7-2026-11-15.json)，包括仓库、声明的 homepage、实际读到的站名、README SHA 与核验状态。不是全部搜索结果的穷尽审计。
- 读取 README 后检查 `industry/site.ts` 或 `site/site.ts`，并查 repository homepage。很多名称看起来很垂直的仓库，读到的配置仍为 `MyHOT`、默认 AI 描述与 localhost；不能把名字直接转换成已经建成的行业站。
- 只读公开文档与配置，不运行外部项目代码，不读取真实 `.env`。公开页面读取器无法访问数学教育 HOT，但本机匿名 HTTP 与实际 RSS 能验证；不能把某一个读取器报错当成网站已失效。

## 有实质改造线索、尚无已核实可用公开入口

| 项目 | 已观察到的实质线索 | 本轮结果 |
|---|---|---|
| [jobhot](https://github.com/liuger/jobhot) | README 与行业配置明确央国企、事业单位、留学生及 ESG 求职方向；homepage 为 `jobhot.vercel.app` | 读取首页返回 503，未纳入 |
| [AIFocus](https://github.com/soloprimus/aifocus.online) | README 明确产业链版，给出 `aifocus.online` 和部署说明 | 本机 403、公开读取器失败，未纳入；不推断永久停运 |
| [RoboTaxi](https://github.com/littleweb/robot-taxi.news) | README 与运行说明明确 Robotaxi 定制、静态导出；为神灯同一作者 | `robot-taxi.news` 本机 503、公开读取器失败，未纳入 |
| [ElectroRadar](https://github.com/goodYY12/electrical-engineering-hotspot) | README 明确 AIHOT 电气工程版，homepage 为 `electroradar.vercel.app` | 首页与 RSS 都返回 404，未纳入 |
| [CVEHOT](https://github.com/zseeu1/CVEHOT) | README 明确漏洞情报定制 | 未核实独立公开地址；其引用的 `unsafe.sh/cve` 是参考对象，不是它自己的部署站 |
| [星潮 Starwave](https://github.com/kael-odin/starwave) | README 明确基于 AIHOT；配置已改开源动态与仓库档案方向 | README 自述 P0 阶段，未核实公开地址 |
| [WujieHOT](https://github.com/Pytorchlover/WujieHOT) | README 与配置为具身智能、机器人学习 | 未核实公开地址 |
| [EAGLE GSAI](https://github.com/hxhxixi-star/aduithot) | 配置明确全球供应商审核情报 | 未核实公开地址；不能误写成已上线的通用反腐审计服务 |
| [AcadHot](https://github.com/reisen-ww/AcadHot) | 配置明确前沿科技、生命科学与医学 | 只有本地服务地址，未核实公开部署 |
| [器械脉搏 MedPulse](https://github.com/BruceZhu33/medpulse) | 配置明确药监局、FDA、厂商与器械行业媒体 | 未核实公开地址 |
| [Noise Floor](https://github.com/LosNadie/Noise-Floor) | README 明确 AIHOT 定制关系与视觉改造；配置有独立站名 | 未核实公开地址 |
| [跨境热点](https://github.com/Waiken-K/crossborder-hot) | 配置明确跨境账户、税务身份、资金路径、海外通信 | 未核实公开地址 |

其他读取到默认配置或只看到模板式 README 的仓库保留在机器清单，**不等于证明其没有私有定制**。例如养老、商用车、薄膜、热泵等仓库名字可作下一轮线索，但目前不能报告为已验证行业服务。独立聚合项目如 Echo Trending 只声明使用 AIHOT 作为一个信源，缺少框架改造证据，也不放进同系邻域。

## 验证与交付边界

- 复用现有目录实现，不增加数据库迁移或新页面。离线回归验证两条都是 link、URL 准确、无 RSS Seed，将 `fetch` 设为抛错后仍返回 `{via: "none", items: [], error: null}`。
- 本地已通过 typecheck、24 项邻域测试、Web build、30 项 Web Tests；合成 API + 实际构建的 SSR 返回 HTTP 200，50 个启用条目中的两个新链接与静态周报说明均存在，两类分组保留。该合成页面不是生产部署验收。完整后端测试、Docker smoke 等以 GitHub CI 为准，全部通过再合并。
- GitHub 合并不能代替腾讯云部署。需要有权限的操作员重建 API/worker 并核对 `/peers` 的两张卡、静态站说明和原站链接。本轮不声称生产已更新。
- 回滚删除这两项及其回归断言即可，无数据库或抓取状态需要清理；发现记录和候选清单可保留历史证据。
