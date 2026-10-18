# Yi‑Hot 公益动态

Yi‑Hot 是一个公益行业动态聚合站。它定时读取政府部门、公益机构、媒体、微信公众号和邮件简报，生成中文标题与摘要，保留原文链接，并按周、按月生成「总报」。

线上站点：<https://49.233.72.222/yihot/>

管理后台：<https://49.233.72.222/yihot/admin>

> **交接给新维护者时，先读本页即可。** 日常工作通常只需要打开后台查看运行状态和信源，不需要理解模型、提示词或代码。需要技术处理时，再按文末的文档入口操作。

## 这个站现在怎么工作

```text
公开信源 / 公众号 / 邮件
          ↓
    自动采集和去重
          ↓
  相关性判断、摘要和标签
          ↓
动态 ── 热点 ── 主题
          ↓
     每周、每月总报
```

- 「动态」是主要阅读入口，优先按**原文发布日期**排列；原文没有日期时才显示收录时间，并明确标注「收录」。
- 「精选」栏目目前隐藏，但精选状态和卡片标签仍保留，用于总报、后台判断和以后恢复。
- 周报每周生成，月报每月生成；日报已经停用。
- 网站部署在腾讯云。采集、分析和发布都在服务器上运行，维护者不需要一直开着自己的电脑。
- 微信公众号由服务器上的 WeRSS 辅助采集；QQ 邮箱中的指定简报由邮件采集服务每 30 分钟检查一次。

## 新维护者第一次接手

原维护者应通过安全方式分别交付以下内容，**不要把密码写进 README、聊天记录或 Git 仓库**：

1. 腾讯云账号或服务器 SSH 访问方式。
2. GitHub 仓库访问权限。
3. Yi‑Hot 后台管理员密码。
4. 凭据归档的解密口令。
5. QQ 邮箱、微信公众平台等外部账号的必要权限。

接手后按下面顺序确认：

1. 打开[线上站点](https://49.233.72.222/yihot/)，确认「动态」能正常显示。
2. 登录[管理后台](https://49.233.72.222/yihot/admin)，查看「运行」和「信源」页面是否有连续失败。
3. 打开「总报」，确认最近一期周报或月报可以阅读。
4. 在 GitHub 确认自己能看到本仓库，但不要随意删除分支、Actions、`LICENSE` 或 `NOTICE`。
5. 把解密口令存进个人密码管理器；不要和加密文件放在同一个位置。

完成以上五项，就具备日常维护条件。

## 日常维护只做这些

| 频率 | 要看什么 | 正常表现 | 发现异常怎么办 |
| --- | --- | --- | --- |
| 每周一次 | 网站首页和动态 | 最近几天有新内容，原文链接可打开 | 去后台「运行」和「信源」查看失败原因 |
| 每周一次 | 总报 | 周报正常生成 | 记录缺失日期和页面地址，交给技术维护者检查任务队列 |
| 每月一次 | 信源健康 | 大部分启用信源为正常；个别网站偶发失败可以观察 | 同一信源连续失败多次再处理，不要立即删除 |
| 每月一次 | 用量与成本 | 费用和调用量没有突然异常增长 | 暂停异常来源或模型调用，并请技术维护者核查 |
| 增加新来源时 | 原文质量、发布日期、版权边界 | 能稳定取得标题、摘要、发布日期和原文链接 | 先作为候选试抓，不要直接开启全文展示 |

后台入口：

- **内容诊断**：查看某条动态为什么出现、为什么没有入选。
- **信源**：查看采集是否正常，也可以先试抓再决定是否启用。
- **运行**：查看自动任务成功或失败。
- **用量与成本**：查看模型调用量和费用。
- **反馈**：处理读者提交的更正、下架或其他意见。

## 三种常见情况

### 网站能打开，但最近没有新内容

先去后台检查：

1. 「信源」里最近采集是否成功；
2. 「运行」里 worker 是否持续运行；
3. 新抓到的内容是否被判断为与公益无关；
4. 原文发布日期是否确实较早。

不要把本站收录时间当成原文发布日期，也不要为了让页面看起来更新而手工改日期。

### 某个来源连续失败

先保留来源并记录错误。网站改版、验证码、登录失效和 RSS 临时中断都可能造成失败。公众号失败通常先检查 WeRSS 登录状态；邮件来源失败通常先检查 QQ 邮箱授权是否仍有效。只有确认来源永久停用或不再适合收录时才关闭。

### 需要修改页面、部署或修复程序

这属于技术维护。把问题现象、发生时间、页面地址和后台错误一起交给技术人员。若使用编码 Agent，可以直接给它下面这段话：

```text
请先阅读仓库根目录 AGENTS.md、docs/PROJECT_CONTEXT.md、
docs/memory/MEMORY.md、tools/README.md 和 secrets/README.md。
先核实线上现象和运行状态，再修改、测试、同步 GitHub 并部署腾讯云。
不要输出或提交任何密钥。
```

## 不要直接做的事

- 不要把 `.env`、邮箱授权码、后台密码、SSH 密码或 API Key 提交到 GitHub。
- 不要直接改数据库里的日期、精选结果或费用记录。
- 不要因为一两次失败就删除信源或历史内容。
- 不要绕过后台和现有脚本在生产服务器上临时改代码。
- 不要随意修改模型、评分门槛或提示词；这些改动会影响全部内容，需要样本校准和测试。
- 不要删除或改写 `LICENSE`、`NOTICE` 中的上游版权信息。
- 不要使用 AIHOT 的名称或 Logo 作为 Yi‑Hot 的品牌。

## 备份、凭据与换电脑

- 生产运行时凭据以服务器 `/opt/yihot/.env` 为准。
- 仓库中的 `secrets/credentials.env.enc` 是加密备份；解密口令不在仓库中。
- 明文凭据只保存在本机忽略文件和服务器，不进入 Git。
- 凭据发生变化后，要更新服务器、更新本机明文归档、重新加密并提交新的密文。
- 换电脑或交接的完整步骤见 [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) 第 8、9 节和 [`secrets/README.md`](secrets/README.md)。

## 给技术维护者的入口

请依次阅读：

1. [`AGENTS.md`](AGENTS.md)：项目规则与安全边界。
2. [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md)：服务器、部署、数据口径和接手清单。
3. [`docs/memory/MEMORY.md`](docs/memory/MEMORY.md)：运维经验索引。
4. [`tools/README.md`](tools/README.md)：GitHub 同步、部署和核查脚本。
5. [`secrets/README.md`](secrets/README.md)：凭据加密归档。
6. [`docs/sources.md`](docs/sources.md)：信源类型与配置。
7. [`docs/selection.md`](docs/selection.md)：精选判断与校准。

最低验证命令：

```bash
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
```

涉及数据库行为时还要在名称以 `_test` 或 `_ci` 结尾的测试库中运行迁移和 `npm test`。本项目在当前网络环境下推送 GitHub 必须使用 `tools/sync.py`；完整说明见 [`tools/README.md`](tools/README.md)。

## 来源、版权与 AIHOT 归属

**Yi‑Hot 是在 [AIHOT](https://github.com/KKKKhazix/AIHOT) 开源项目基础上修改的公益行业定制版本。** AIHOT 由“数字生命卡兹克 / KKKKhazix”开发，代码依据 MIT License 开放。本仓库保留了上游的 [`LICENSE`](LICENSE) 和 [`NOTICE`](NOTICE)。

使用、复制、修改或再发布本项目时必须注意：

1. 按 MIT License 要求，在软件副本或主要部分中保留原版权声明和许可文本。
2. 保留 `NOTICE` 中的上游及第三方材料说明。
3. AIHOT 的名称和 Logo 不属于 MIT 授权范围；本项目使用自己的 Yi‑Hot 名称和品牌，也不得让人误以为这是 AIHOT 官方站点。
4. 原始新闻、图片和文章版权归各来源所有。Yi‑Hot 默认只展示摘要和原文链接，只有来源明确允许时才展示全文。
5. 新增第三方代码、图片、字体或数据前，应核对其许可证并补充相应归属说明。

本节用于帮助维护者保留清晰来源，并不替代 `LICENSE`、`NOTICE` 或专业法律意见。

## 技术概览

- Node.js 24、TypeScript、React Router、Fastify
- PostgreSQL 17、pg-boss
- Docker Compose
- 一个镜像运行 Web、API、worker 和数据库初始化任务
- 公开出口包括网站、RSS、API 和 MCP

项目内部仍保留 `aihot`、`@aihot/*` 和 `aihot-*` 等技术标识，这是为了兼容上游结构和现有部署；对外品牌始终是 **Yi‑Hot**。

---

# 完整维护手册

下面的内容面向第一次接手、不了解 API、模型或服务器的维护者。它把日常使用、密码、模型、采集、邮件、部署和故障处理放在同一份文档中。遇到复杂改动时，再沿文中的链接阅读专题文档。

## 一、完整运行链路

```text
网站 / RSS / 微信公众号 / QQ 邮件
                  ↓
           定时采集、规范化、去重
                  ↓
          公益相关性判断和内容分析
                  ↓
        中文标题、摘要、分类、主题、标签
                  ↓
       全部动态 / 主题页 / RSS / 公开 API
                  ↓
             每周、每月公益总报
                  ↓
        网站阅读 / 邮件订阅 / 外部程序读取
```

服务器上的 worker 持续执行这些任务。维护者关掉自己的电脑不会影响网站、公众号采集、邮件采集或总报发送。

生产服务如下：

| 服务 | 作用 | 运行方式 |
| --- | --- | --- |
| `aihot-web-1` | 网页、SSR、FutureMe 反向代理 | Docker |
| `aihot-api-1` | 公开 API、后台 API、订阅 API | Docker |
| `aihot-worker-1` | 采集、分析、归组、发布、总报 | Docker |
| `aihot-db-1` | PostgreSQL 数据库 | Docker volume |
| `yihot-werss-werss-1` | 微信公众号 RSS | Docker |
| `yihot-email-source.timer` | 每 30 分钟读取获准邮件来源 | systemd |
| `yihot-email-delivery.timer` | 每 30 分钟发送确认信和总报 | systemd |
| `futureme-app` | 同服务器的 FutureMe 项目 | 独立 Docker 项目 |

## 二、后台怎么用

后台地址是 <https://49.233.72.222/yihot/admin>。登录成功后浏览器保存有时效的会话 Cookie；不要在公用电脑保存登录状态。

### 信源

这里回答“平台正在从哪里取内容”。重点看启用状态、最近采集、连续失败和采集间隔。

- 新来源先预览真实标题、发布日期和原文链接。
- 初始设为暂停或隔离，确认内容范围后再改为编辑候选。
- 一两次网络超时可以观察；连续多次失败再处理。
- 不要为了增加内容量而开启全文展示或降低相关性门槛。

### 内容诊断

这里回答“某条动态为什么出现、为什么没出现”。可以查看原始文章、模型分析、发布记录、事件归组和调用回执。

- 字段错误通过后台 override 或正规回填脚本修正。
- 重新分析会产生模型费用，先确认原始数据确实有错。
- 隐藏、合并、拆分等操作要写明原因，操作会进入审计记录。

### 运行

这里回答“自动任务是否正常”。重点关注采集是否持续、是否出现成片失败、付费请求是否结果未知、投递是否需要人工处理。单次失败不一定是故障；所有来源同时停止或同类错误连续出现才需要立即处理。

### 用量与成本

这里显示模型调用数、输入/输出 token、估算费用和月化区间。费用依赖后台维护的单价；显示“未定价”不代表免费，而是模型名称没有匹配的价格记录。

平台后台预算是第一层保险丝，模型服务商控制台的余额和消费上限是第二层。任一侧达到上限都会停止相应调用。

### 模型与评测

这里能看到每类任务使用的模型、成功率、延迟、token 和费用，也可以切换模型。切换前应先配置新模型 API Key，用少量真实样本验证结构化输出，维护单价，并观察至少一个采集周期。

### 反馈与审计

反馈页用于处理读者提交的更正、下架和其他意见。审计页用于追溯管理员操作。发生误操作时应修正并说明原因，不要删除审计记录。

## 三、后台密码与凭据

### 密码在哪里

后台密码是环境变量 `ADMIN_PASSWORD`。明文不在 Git 仓库中。当前生产真值位于：

```text
/opt/yihot/.env
```

仓库中的加密备份是：

```text
secrets/credentials.env.enc
```

拿到原维护者单独交付的解密口令后，在仓库根目录运行：

```bash
bash tools/secrets.sh decrypt
```

命令会生成被 Git 忽略的 `secrets/credentials.env`。从中查看 `ADMIN_PASSWORD`。不要把这个文件、密码或屏幕截图发到聊天或提交到 GitHub。

### 忘记密码怎样重置

如果仍能登录服务器：

```bash
ssh <服务器用户>@<服务器地址>
cd /opt/yihot
sudoedit .env
```

把 `ADMIN_PASSWORD` 改成至少 12 位的随机密码，然后让容器重新读取 `env_file`：

```bash
sudo docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml up -d
```

只执行 `docker restart` 不会重新读取 `.env`。验证新密码后，把新值同步进本机 `secrets/credentials.env` 并重新加密：

```bash
bash tools/secrets.sh encrypt
```

如果解密口令和 SSH 权限都丢失，需要先通过腾讯云控制台恢复服务器访问。加密归档没有后门。

### 各类凭据的位置

| 凭据 | 生产位置 | 用途 |
| --- | --- | --- |
| Yi-Hot 主配置 | `/opt/yihot/.env` | 后台、数据库、模型、签名、功能开关 |
| 邮件信源 | `/opt/yihot-email/.env` | QQ IMAP、来源白名单、ingest token |
| 邮件投递 | `/opt/yihot-email-delivery/.env` | QQ SMTP、发件地址、站点地址 |
| WeRSS | `/opt/werss/.env` | 管理账号、签名密钥、镜像配置 |
| 核心凭据备份 | `secrets/credentials.env.enc` | 换电脑和灾难恢复 |

服务器配置是运行时真值，加密归档是备份。凭据变更顺序是：更新服务器、重建并验证服务、更新本机明文、重新加密、只提交密文。

## 四、模型 API 从零说明

### API、Key 和 token 分别是什么

- **API** 是程序调用服务的网络接口。Yi-Hot 通过 API 自动请求模型，不是在浏览器里操作聊天网页。
- **API Key** 类似只给程序使用的密码，通常在模型服务商控制台创建。
- **Base URL** 是服务商的接口地址。
- **Model** 是具体模型名称。
- **Token** 是模型读写文本的计费单位，与 GitHub Token、后台密码不是同一种东西。

不要在聊天里发送 API Key。应直接写入服务器 `/opt/yihot/.env`，或先写入本机被忽略的凭据文件后安全部署。

### 申请和配置步骤

1. 注册 DeepSeek、阿里云百炼、智谱等支持 OpenAI 兼容接口的服务商。
2. 在服务商控制台开通模型服务并创建 API Key。
3. 充值或设置服务商侧消费上限。
4. 在服务器 `/opt/yihot/.env` 填写接口地址、Key 和模型名。
5. `docker compose up -d` 让新配置生效。
6. 去后台「运行」「模型与评测」「用量与成本」检查下一批任务。

服务商的模型名、价格和接口会变化，应以其当前官方控制台为准。

最小配置示例：

```dotenv
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=在服务商控制台创建的Key
LLM_MODEL=服务商当前支持的模型名
LLM_EXTRA_JSON={"thinking":{"type":"disabled"}}
```

阿里云百炼示例：

```dotenv
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=在百炼控制台创建的Key
LLM_MODEL=服务商当前支持的模型名
LLM_EXTRA_JSON={"enable_thinking":false}
```

平台可以给不同步骤分配不同模型：

| 变量 | 任务 |
| --- | --- |
| `PREFILTER_MODEL` | 公益相关性预筛 |
| `SCORE_MODEL` | 重要性评分 |
| `UNDERSTAND_MODEL` | 内容理解 |
| `SUMMARIZE_MODEL` | 标题和摘要 |
| `STRUCTURE_MODEL` | 结构化抽取 |
| `GROUP_MODEL` / `GROUP_REVIEW_MODEL` | 事件归组和复核 |
| `DIGEST_MODEL` | 事件摘要 |
| `REPORT_MODEL` | 周报和月报 |
| `TRANSLATE_MODEL` | 翻译 |

不设置这些变量时全部使用 `LLM_MODEL`。对非技术维护者，先维持一套稳定默认模型最容易维护。

费用异常时可以把 `MODEL_CALLS_ENABLED=false` 作为紧急止损。`COLLECT_ENABLED=false` 会停止采集。恢复前先查明原因，以免积压内容一次性触发大量付费请求。

## 五、信息源结构与新增来源

| 类型 | 当前例子 | 采集方式 | 常见问题 |
| --- | --- | --- | --- |
| RSS/Atom | 媒体、机构更新 | worker 定时读取 | feed 停更、日期不规范 |
| 网站列表 | 政府部门、机构官网 | 列表页与详情页解析 | 网站改版、验证码、403 |
| 微信公众号 | 公益时报、机构公众号 | WeRSS 和微信读书兼容层 | 登录失效、微信频控 |
| 邮件简报 | AmCham、慈善纪事简报 | QQ IMAP 发件人白名单 | 授权码失效、模板变化 |
| 外部推送 | 受控采集脚本 | `POST /api/ingest/items` | token 泄露、错误数据 |

运行时真值是 PostgreSQL 的 `sources.config`。`industry/sources.json` 只是初始 seed，不会覆盖数据库已有配置。

增加 RSS 或网站来源时：

1. 在后台「候选信源」或「新增信源」粘贴地址。
2. 让系统发现 feed，并预览数条真实内容。
3. 核对标题、原文发布日期和原文链接。
4. 使用唯一、稳定的英文 ID。
5. 初始暂停或隔离，检查后再启用为编辑候选。
6. 保持 `site_fulltext=false`，除非来源明确允许转载全文。

“候选信源”包含 NewsMail、charity-intelligence 等项目留下的历史线索，不等于全部可以一键启用。有些地址失效、有些已被当前来源覆盖、有些会返回验证码或 403。

### 微信公众号

WeRSS 在服务器运行，管理端只监听 `127.0.0.1:18001`。重新扫码或管理账号时，从本机建立 SSH 隧道：

```bash
ssh -N -L 18001:127.0.0.1:18001 <服务器用户>@<服务器地址>
```

然后打开 <http://127.0.0.1:18001>，使用 `/opt/werss/.env` 中的管理账号登录。验收必须同时确认：扫码成功、账号已添加、feed 有真实条目、Yi-Hot 能预览和入库、日期及原文链接正确。详见 [`docs/WERSS_DEPLOY.md`](docs/WERSS_DEPLOY.md)。

### 邮件来源

当前白名单包含：

- `AmCham China Events <amchamevent@amchamchina.org>` 及其代发信封域，只保留公益、社会影响、ESG、可持续发展等相关活动；
- 爱德传一基金会《慈善纪事简报》`aidechuany@batch.lingxi360.com`。

采集器每 30 分钟用 IMAP `BODY.PEEK[]` 只读检查 QQ 邮箱，不标记已读、不移动、不删除。增加来源时应先登记发件地址和来源名称，再用历史样本试跑；不能吸收整个邮箱。

可信的邮件 `Date` 头作为发布日期；缺失或时区不可靠时显示“收录”，不会猜日期。详见 [`docs/EMAIL_SOURCE_DEPLOY.md`](docs/EMAIL_SOURCE_DEPLOY.md)。

## 六、分类、主题和标签

一条动态可以同时有三种维度：

| 维度 | 回答的问题 | 示例 |
| --- | --- | --- |
| 内容形态 `category` | 这是什么形式？ | 政策、机构、项目、研究、一线、观点 |
| 公益领域 `topic` | 它关注什么议题？ | 儿童教育、儿童保护、环境保护 |
| 卡片标签 `tag` | 给读者看的短提示 | 儿童教育、政策、教育部 |

因此“教师法修订”可以同时是内容形态“政策”和公益领域“儿童教育”。“政策倡导”是一个使命主题，指倡导行动，不等于全部政策新闻。

当前 13 个公益领域是：儿童教育、营养健康、性别平等、儿童保护、网络保护、青年发展、亲子养育、残障融合、应急救援、环境保护、募集筹款、政策倡导、其他领域。前 12 项允许交叉；“其他领域”只用于未命中前 12 项的公益内容，不能与具体领域同时出现。

内容进入公开动态至少需要：来源参与方式为 `editorial`、公益相关性通过、有标题、有摘要。独立“精选”栏目暂时隐藏，但精选状态仍保留，用于数据分析和未来恢复。

## 七、日期和重复内容

| 字段 | 含义 |
| --- | --- |
| `published_at` / `publishedAt` | 原文真正发布的时间 |
| `discovered_at` / `discoveredAt` | Yi-Hot 第一次抓到它的时间 |

动态页优先显示和使用原文发布日期；原文确实没有日期时才显示“收录”。晚到旧内容通过 `backfill` 回到原文日期位置，不能用今天的收录时间冒充新内容。

日期异常时依次检查原始页面或邮件、`published_at`、`discovered_at`、`backfill`、`timeline_at` 和发布物化记录。不要直接修改 `publications.sort_at`，下一次发布会覆盖它。

去重分为规范 URL、邮件 Message-ID、文章身份、规范化标题、同一事实事件和总报引用等层次。发现重复时先判断是同一篇、同一事实还是标题相似的不同事件，再合并；不要只按标题批量删除。

## 八、公益总报和邮件订阅

- 日报已经停用。
- 周报按完整自然周生成，月报按完整自然月生成。
- 报告按原文发布日期纳入周期内全部合格候选，不只取少量精选。
- 没有合格内容的周期不生成空报告。
- 历史重组脚本是 `scripts/recompose-period-history.ts`，`--through` 是不包含的截止日。

公开订阅流程：

```text
/subscribe 提交邮箱
        ↓
发送 48 小时有效的确认邮件
        ↓
读者点击确认
        ↓
从下一期开始接收周报/月报
        ↓
邮件中的签名链接可以退订
```

每个收件人单独发送，数据库 outbox 按“报告类型 + 期号 + 订阅人”防重。明确永久退信会标记为 `bounced`；SMTP 已接受但回执中断时记录 `unknown`，避免自动重发造成重复邮件。

检查命令：

```bash
systemctl status yihot-email-delivery.timer
journalctl -u yihot-email-delivery.service -n 50 --no-pager
```

当前每 30 分钟领取最多 20 封，理论队列吞吐约 40 封/小时，现阶段建议控制在 100–200 个订阅者。扩大推广前应复用 SMTP 连接、连续处理队列并限速；超过数百至上千订阅者时改用专业邮件服务。详见 [`docs/EMAIL_DELIVERY.md`](docs/EMAIL_DELIVERY.md)。

## 九、公开 API、RSS 和 MCP

API 是给程序读取数据的地址，普通读者不需要使用。公开读取不需要后台密码或 API Key。

浏览器示例：

<https://49.233.72.222/yihot/api/v1/items?mode=all&window=7d&by=published&limit=10>

命令行：

```bash
curl "https://49.233.72.222/yihot/api/v1/items?mode=all&window=7d&by=published&limit=10"
```

JavaScript：

```js
const response = await fetch(
  "https://49.233.72.222/yihot/api/v1/items?mode=all&window=7d&by=published&limit=10",
);
if (!response.ok) throw new Error(`Yi-Hot API ${response.status}`);
const data = await response.json();
console.log(data.items);
```

常用参数：

| 参数 | 可选值 | 作用 |
| --- | --- | --- |
| `mode` | `all`、`selected` | 全部合格动态或精选状态动态 |
| `window` | `24h`、`7d` | 时间窗口 |
| `by` | `published`、`timeline` | 原文发布日期或平台时间线 |
| `category` | API 内容形态 key | 按内容形态过滤 |
| `q` | 2–200 字符 | 搜索 |
| `limit` | 1–100 | 每页条数 |
| `cursor` | 上一页返回值 | 翻页 |

长期集成应使用 `/api/v1`，不要依赖后台 API 或网页内部 `/api/site/*`。RSS 和 MCP 与网页共用统一公开读取层，不会因为读者打开而调用模型。

`POST /api/ingest/items` 是受保护的写入入口，需要至少 16 位的 `INGEST_TOKEN`。它不是公共 API，token 不能放入网页、客户端应用或公开仓库。

## 十、服务器容量基线

生产服务器是腾讯云北京区域 2 核、2GB 内存、50GB 磁盘。2026-10-18 实测：

- 磁盘使用约 63%，剩余约 18GB；
- PostgreSQL 约 90MB，最大连接 100，当前约使用 15；
- 主机已使用少量 Swap，内存是第一瓶颈；
- 主要容器没有重启记录。

短时只读探测：

| 服务 | 实测 | 当前保守规划 |
| --- | --- | --- |
| Yi-Hot 动态页 | 20 并发全部成功，P95 约 0.58 秒 | 20–30 名同时活跃读者 |
| FutureMe 普通页面 | 20 并发全部成功，P95 约 0.09 秒 | 普通页面 20 并发无明显压力 |
| FutureMe AI | 程序限制同时 3 个模型请求 | 超出会等待 |
| Yi-Hot 邮件 | 20 封/30 分钟 | 100–200 个订阅者 |

访问分散时，Yi-Hot 约可承载 1,000–3,000 次日访问。这不是保证值；页面类型、缓存、机器人、FutureMe AI、WeRSS 刷新和批处理都会改变容量。

FutureMe 当前全站公共每日保护额度：新会话 80、文本模型 120、图片 12、实时语音 24、语音识别 60、语音合成 80、媒体处理 80。这些是程序内的每日次数保险丝，不是模型平台的金额上限。

出现以下情况应优化或扩容：可用内存持续低于 300MB、Swap 持续增长到 1GB 以上、负载均值长期超过约 1.5、页面 P95 长期超过 1 秒、出现 5xx、磁盘超过 80%、邮件接近 200 订阅者，或 FutureMe 经常达到并发和每日额度。下一档优先考虑 2 核4GB。

## 十一、巡检和故障处理

### 巡检表

| 频率 | 检查内容 | 正常表现 |
| --- | --- | --- |
| 每周 | 首页、动态、主题、总报 | 最近几天有内容，日期和链接合理 |
| 每周 | 后台运行与信源 | worker 持续运行，无成片失败 |
| 每周 | AmCham 和慈善纪事邮件 | IMAP 游标前移，发布日期正确 |
| 每月 | 用量与成本 | 调用和费用没有突然跳升 |
| 每月 | 磁盘、内存、容器 | 磁盘低于 80%，无重启循环 |
| 每季度 | 恢复演练和账号权限 | 凭据可解密，关键账号可登录 |

### 网站打不开

```bash
cd /opt/yihot
sudo docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml ps
sudo docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml logs --tail=100 web api
curl -fsS http://127.0.0.1/yihot/api/health
```

先看容器和健康接口，不要通过删除 volume 或数据库来尝试修复普通启动问题。

### 网站能开但没有新内容

1. 后台「信源」最近是否抓到内容；
2. 后台「运行」中的 worker 是否持续运行；
3. 新内容是否被公益相关性预筛拦截；
4. 原文发布日期是否较早，因 backfill 排在历史位置；
5. `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 是否开启；
6. 模型账户余额和 API Key 是否正常。

不要用收录时间冒充发布日期来制造更新。

### WeRSS 故障

```bash
cd /opt/werss
sudo docker compose -f compose.yml -f compose.weread.yml ps
sudo docker compose -f compose.yml -f compose.weread.yml logs --tail=80
systemctl status yihot-weread.timer
journalctl -u yihot-weread.service -n 80 --no-pager
```

微信返回频控时不要反复刷新；登录失效时通过 SSH 隧道重新扫码。

### 邮件故障

```bash
systemctl status yihot-email-source.timer
journalctl -u yihot-email-source.service -n 50 --no-pager
systemctl status yihot-email-delivery.timer
journalctl -u yihot-email-delivery.service -n 50 --no-pager
```

QQ 邮箱使用 IMAP/SMTP 授权码，不是 QQ 登录密码。授权码失效时到邮箱设置重新生成，更新对应服务器 `.env` 后重启服务。

## 十二、本地开发、测试、同步和部署

### 环境要求与本机启动

- Node.js 24.11 或更高；
- npm workspaces；
- Docker 与 Docker Compose；
- 后端测试需要独立 PostgreSQL 测试库；
- Python 3 用于运维和邮件脚本。

```bash
npm ci
cp .env.example .env
node scripts/init-env.ts
docker compose up -d --build
```

本机通常访问 <http://localhost:3000>，后台是 <http://localhost:3000/admin>。`.env` 不能提交。

改动后的最低验证：

```bash
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
```

涉及数据库行为时，`DATABASE_URL` 必须指向名称以 `_test` 或 `_ci` 结尾的空测试库，然后运行迁移和 `npm test`。涉及信源清单时还要运行：

```bash
npm run sources:audit
npm run sources:audit:check
```

### 同步 GitHub

当前开发机的 Git smart HTTP 不稳定，推送必须走仓库脚本：

```bash
python tools/compare.py
python tools/sync.py -m "说明改了什么以及为什么" README.md
python tools/compare.py
```

远端删除使用 `tools/delete.py`。详情见 [`tools/README.md`](tools/README.md)。

### 部署腾讯云

生产代码目录是 `/opt/yihot`。上传本次完整文件集合后运行：

```bash
cd /opt/yihot
sudo docker compose \
  -f docker-compose.yml \
  -f compose.futureme-proxy.yml \
  -f compose.werss.yml \
  config --quiet

sudo docker compose \
  -f docker-compose.yml \
  -f compose.futureme-proxy.yml \
  -f compose.werss.yml \
  build

sudo docker compose \
  -f docker-compose.yml \
  -f compose.futureme-proxy.yml \
  -f compose.werss.yml \
  up -d
```

`industry/`、`data/` 和源码会被烘焙进镜像，变化后必须 rebuild。禁止把 `docker cp` 加 `restart` 当成正式部署；容器重建后临时文件会消失，`.env` 也不会在普通 restart 时重新读取。

生产至少验收：门户、`/yihot/`、`/yihot/all`、`/yihot/topics`、`/yihot/subscribe`、`/yihot/api/health` 和 `/futureme/` 返回正常；FutureMe 后台匿名访问应为 401，Yi-Hot 后台匿名访问应跳转登录页。

最后用 Git blob SHA 核对本地、GitHub `main` 和服务器 `/opt/yihot`，不要用 commit SHA 判断三方一致。

## 十三、备份、换电脑和交接

| 内容 | 位置 | 用途 |
| --- | --- | --- |
| 源码与文档 | GitHub 私有仓库 | 恢复应用和运维知识 |
| PostgreSQL | Docker `db` volume / 对象存储 | 文章、分析、总报、订阅、审计 |
| 主配置 | `/opt/yihot/.env` | 密码、模型和签名 |
| WeRSS | `/opt/werss/data` 与 `.env` | 公众号订阅和登录状态 |
| 邮件状态 | 两个邮件服务的状态目录 | IMAP 游标和退信游标 |
| 加密凭据 | `secrets/credentials.env.enc` | 新设备恢复核心凭据 |

加密凭据不能替代数据库和 WeRSS 数据备份。每季度至少验证一次能解密归档、能登录关键账号，并确认数据库备份可恢复。

新设备：

```bash
git clone https://github.com/CochraneK/Yi-hot
cd Yi-hot
bash tools/secrets.sh decrypt
npm ci
python tools/compare.py
```

之后按顺序读：`AGENTS.md`、本文、`docs/PROJECT_CONTEXT.md`、最新 `docs/HANDOFF-*.md`、`docs/memory/MEMORY.md`、`tools/README.md`、`secrets/README.md`。

交给不懂 AI 的维护者时，他只需要掌握四件事：每周查看网站和后台；异常时保存时间、地址和错误；密钥只放密码管理器与服务器配置；技术修改交给开发人员或编码 Agent，并要求完成测试、同步、部署和验收。

可以把下面这段原样交给技术人员或编码 Agent：

```text
请先阅读仓库根目录 AGENTS.md、README.md、docs/PROJECT_CONTEXT.md、
最新的 docs/HANDOFF-*.md、docs/memory/MEMORY.md、tools/README.md 和
secrets/README.md。先核实线上现象和运行状态，再修改、测试、同步
GitHub 并部署腾讯云。不要输出或提交任何密钥；三方一致性用 Git blob SHA 核验。
```

## 十四、代码和行业配置地图

| 位置 | 作用 |
| --- | --- |
| `apps/web` | 页面、SSR 和反向代理 |
| `apps/api` | HTTP API、后台鉴权、订阅和 ingest |
| `apps/worker` | 后台任务进程 |
| `packages/backend` | 采集、模型、发布、数据库和业务逻辑 |
| `packages/contracts` | 前后端共享类型和 HTTP 契约 |
| `industry/site.ts` | 站名与公开文案 |
| `industry/taxonomy.ts` | 内容形态和分类 |
| `industry/topics.json` | 主题与机构板块 |
| `industry/sources.json` | 初始信源 seed |
| `industry/prompts/` | 相关性、摘要、评分和报告提示词 |
| `industry/selection.ts` | 评分与入选门槛 |
| `industry/card-tags.ts` | 卡片短标签归一化 |
| `industry/brand/` | Logo、图标和品牌资源 |
| `database/migrations` | 向后兼容的数据库迁移 |
| `deploy/` | Caddy、WeRSS 和邮件服务部署材料 |

站名、关注来源、重要性判断、分类、隐私条款和服务条款必须由项目负责人决定。评分门槛要用标注样本校准，不要由开发者凭感觉修改。

主题和信源 seed 都是 upsert/只增逻辑：从 JSON 删除不代表数据库记录自动消失。正式下线需要明确的数据库处理和验证。

## 十五、后台所有设置逐项说明

后台左侧分为“内容”和“系统”两组。手机端显示为顶部横向导航。右上角或导航数字表示有待处理项目，不代表服务一定故障。

### 内容诊断

可搜索文章并进入完整处理链。常用操作：

| 操作 | 适用情况 | 影响 |
| --- | --- | --- |
| 修改公开字段 | 标题、摘要或日期已有可靠证据证明错误 | 保存人工覆盖，后续发布沿用 |
| 隐藏/恢复 | 内容不适合公开、原文撤回或已核实可恢复 | 改变公开可见性，保留数据和审计 |
| 重新处理 | 原始正文已修复，或旧模型结果明显错误 | 新增模型调用，只影响后续结果 |
| 拆离事件 | 两条内容被错误归为同一事实 | 重建事件关系，不删除文章 |
| 合并事件 | 多个事件实际描述同一事实 | 统一展示和总报引用 |
| SEO 开关 | 页面不适合搜索引擎收录 | 影响索引，不等于隐藏页面 |

任何人工修改都要填写具体理由和证据。日期修正应写原文日期来源，不能只写“看起来不对”。

### 信源列表和信源详情

信源详情中的字段：

| 字段 | 含义 | 建议 |
| --- | --- | --- |
| 名称 | 后台和来源署名使用的名称 | 使用机构或栏目的正式简称 |
| 采集间隔 | 两次轮询的最短分钟数 | 普通来源 30–120 分钟；不要无意义地设为 1 |
| 参与方式 | `editorial` 可成为动态；`ambient` 只作讨论证据；隔离不进入正常发布 | 新来源先隔离或暂停 |
| 等级 | 来源在现有判断体系中的层级 | 按来源性质选择，不按喜好抬高 |
| 讨论分组 ID | 同一机构多个账号共用，避免热点重复计数 | 同主体多入口时设置同一值 |
| 运营主体 ID | 关联机构实体和机构主题 | 使用已有稳定实体 ID |
| 标签 | 来源固有提示 | 只放稳定属性，不替代文章级分析 |
| 一手信源 | 官方账号或官网的来源属性 | 只在能确认官方主体时开启 |
| 站内全文 | 网页是否能展示完整原文 | 默认关闭，明确获授权才开启 |
| 对外全文 | RSS/API 是否能输出完整原文 | 比站内全文更谨慎，默认关闭 |
| 采集配置 JSON | 抓取器地址、选择器、路径等 | 保存前必须预览 |

“预览抓取”不会入库，适合验证配置。“立即采集”会进入正式队列，可能触发分析和费用。暂停会保留已有内容和历史；恢复后会立即排队采集。

详情页还显示健康状态、连续失败次数、游标、上次和下次采集、最近条目、采集记录和人工修改记录。发现“可能漏采”或长期“续读”时，应检查分页和单轮上限。

### 反馈

可以按状态和关键词查找反馈，处理更正、下架或滥用。擦除反馈内容和封禁来源属于高影响操作，必须填写原因。封禁针对匿名来源哈希，不应被当作用户身份系统。

### 运行

这里汇总任务、模型回执和投递。常见人工操作：

- 对失败文章重新排队；
- 对结果未知的付费调用确认是否已经计费；
- 对结果未知的外部投递确认实际结果。

“结果未知”表示网络在请求发出后中断，不能简单重试，否则可能重复付费或重复发送。先查服务商记录或收件结果。

### 用量与成本

时间范围可用于观察短期异常和长期趋势。单价表中的服务名与模型名必须和真实回执匹配。

| 单价字段 | 单位 | 说明 |
| --- | --- | --- |
| 输入 | 每百万输入 token | 模型读取内容的费用 |
| 缓存输入 | 每百万缓存命中 token | 当前调用记录不能可靠区分时只作留档 |
| 输出 | 每百万输出 token | 模型生成内容的费用 |
| 按次 | 每次请求 | 抓取或按请求计费的服务 |

精确模型价格优先于服务兜底价格。删除精确价格后才会回退到空模型名的服务价格。价格变化时填写生效依据和日期。

### 模型与评测

模型来源优先级是：**后台切换 > 环境变量 > 代码默认**。后台选择“恢复默认”只会删除后台覆盖，随后回到环境变量或代码默认。

切换只影响新任务，不会重算历史内容。视觉任务只能选择标记为支持视觉的模型。页面中的成功率、p50/p95 延迟、token 和费用应结合看；不要仅凭一次主观回答切换生产模型。

SelectBench 用同一批标注样本比较模型，适合在更换精选/评分模型前使用。导入评测结果本身不切换生产模型。

### 设置：关于页二维码

可替换微信公众号和飞书群二维码，无需发布代码。支持 PNG、JPG、WebP，最大 2MB，宽高至少 120 像素。上传后写入持久化数据目录并记录审计，关于页缓存最多约 5 分钟后更新。

替换前先用另一部手机扫码验证；不要上传个人收款码或包含无关隐私的截图。

### 设置：通知目的地

这里控制已经登记的飞书等推送目标是否接收新内容。启用时会记录 `enabled_at`，启用之前的历史内容不会补推；停用后只停止新推送，不删除已有投递记录。

页面开关只有在服务器相应环境变量和 webhook/应用凭据也配置正确时才会真正发送。开发和彩排环境即使显示启用，也可能被全局安全阀阻止。

### 设置：付费请求上限

每个服务有每分钟、每小时、每天三层调用次数限制。实际调用必须同时低于三层上限。

- 任意一层填 `0` 会立即停用该服务。
- 达到上限后请求暂停，等待相应窗口释放，不会绕过熔断。
- 页面“已用”显示近 1 小时和近 24 小时的线上调用次数。
- 这些是**调用次数上限**，不是人民币金额；仍需在服务商控制台设置金额预算。
- 调高之前先根据近期用量和单价估算最坏成本，调低时考虑是否会让内容处理长期积压。

### 审计记录

后台模型、预算、信源、通知、二维码、内容和反馈等写操作都会记录操作人、时间、前后值与原因。它是排查“谁改了什么”的第一入口。

## 十六、增加信息源的完整操作手册

### 先判断应该使用哪种来源类型

```text
有 RSS/Atom？ ── 是 → rss
     │
     否
     ↓
公开网页有稳定文章列表？ ── 是 → web_list
     │
     否
     ↓
有公开 JSON API？ ── 是 → json_list
     │
     否
     ↓
微信公众号？ → WeRSS 的 rss
邮件简报？   → email-source 发件人白名单
外部系统主动推送？ → external + 受保护 ingest API
X 账号搜索？ → x_search（需要 SocialData 和预算）
```

优先使用官方 RSS，其次公开 JSON API，再次是网页列表。能不用浏览器渲染和付费抓取就不用，因为结构越简单越稳定。

### RSS 示例

```json
{
  "feedUrl": "https://example.org/feed.xml"
}
```

创建前确认 feed 能直接返回 XML，条目链接指向原文，日期带时区。不要把聚合站 RSS 冒充机构官方来源。

### 网站列表示例

```json
{
  "url": "https://example.org/news",
  "baseUrl": "https://example.org",
  "itemSelector": "article",
  "linkSelector": "a",
  "titleSelector": "h2",
  "allowUrlPrefixes": ["https://example.org/news/"]
}
```

`allowUrlPrefixes` 用于限制只能采集目标栏目，避免导航、招聘、登录和外站链接混入。选择器应在多页样本上验证。网页一旦改版，CSS 选择器可能失效。

### JSON API 示例

```json
{
  "url": "https://example.org/api/posts",
  "mode": "json_api",
  "method": "GET",
  "itemsPath": "data.items",
  "titlePaths": ["title"],
  "summaryPaths": ["summary"],
  "urlTemplate": "{raw:url}"
}
```

只接入公开、稳定、允许使用的接口。不要把登录 Cookie、Bearer Token 或个人账号凭据直接写入信源 JSON；需要鉴权的来源应由后端凭据机制单独支持。

### 公众号来源

1. 建立 WeRSS SSH 隧道并登录。
2. 搜索并核实公众号认证主体。
3. 添加账号，等待真实文章进入 feed。
4. 复制单账号 RSS 地址。
5. 在 Yi-Hot 后台以 RSS 创建，先暂停。
6. 预览日期、标题、原文短链和摘要。
7. 立即采集少量样本，核对公开结果后启用。

不要复制 WeRSS 后台 API 地址。微信会话失效时重新扫码，不需要重建 Yi-Hot 来源。

### 邮件来源

邮件来源不在通用后台表单里直接填邮箱密码。技术维护者需要：

1. 在 `deploy/email-source/collect.py` 的允许发件人配置中登记来源 ID 和地址；
2. 对代发平台同时核对显示发件人和信封域；
3. 准备数封真实历史样本，验证正文、链接、日期和退订链接过滤；
4. 增加或更新数据库来源记录；
5. 运行邮件采集单元测试；
6. 部署脚本和配置，手动试跑；
7. 观察定时器至少一个周期。

不要因为一封转发邮件就放宽整个域名。历史回灌使用 `MAIL_BACKFILL_AFTER` 一次性执行，完成后恢复普通增量模式。

### 新来源验收清单

- [ ] 来源主体和版权边界清楚；
- [ ] 至少预览 5 条不同日期的内容；
- [ ] 标题、链接、发布日期正确；
- [ ] 没有混入导航、招聘、营销和重复列表；
- [ ] 原文缺日期时明确显示“收录”，没有伪造日期；
- [ ] `site_fulltext`、`syndicate_fulltext` 默认关闭；
- [ ] 新来源先隔离或暂停；
- [ ] 正式采集后的相关性、分类和去重正确；
- [ ] 运行一个完整轮询周期后没有连续失败；
- [ ] 若改 `industry/sources.json`，已重生成信源审计快照并更新测试基线。

### 修改和停用已有来源

网站改版时先复制现有 JSON 到本地留档，再修改并预览。使用详情页的版本保护保存，避免覆盖另一位维护者刚做的改动。

来源永久停止时优先“暂停”，保留历史和审计。只有法律、隐私或数据治理明确要求删除时才设计专项清理；不能通过删来源顺便删历史文章。

## 十七、未来同步 AIHOT 上游改动

### 当前状态

现有生产 `main` 与上游 `KKKKhazix/AIHOT` 已经明显分叉，不能直接把上游 `main` 合进当前生产分支，也不能用上游文件覆盖 Yi-Hot。这样做会破坏公益配置、数据库迁移、邮件、WeRSS、FutureMe 路由和现有历史。

仓库已经设计了隔离的上游对齐路线：

| 分支 | 用途 |
| --- | --- |
| `main` | 当前生产兼容版本，继续正常维护 |
| `vendor/aihot-main` | 上游 AIHOT 历史的只读镜像，只允许快进 |
| `rebuild/aihot-aligned` | 基于真实上游祖先重建的新 Yi-Hot |
| `chore/aihot-upstream-bootstrap` | 上游同步机制的审查分支 |

`vendor/aihot-main` **绝不能直接部署**，其中是上游示例行业和默认品牌，不是 Yi-Hot。

### 推荐的更新流程

1. 自动工作流或授权维护者只把公开上游快进到 `vendor/aihot-main`。
2. 阅读上游 changelog、迁移、依赖和安全相关改动，先决定哪些值得吸收。
3. 在 `rebuild/aihot-aligned` 合并 `vendor/aihot-main`，解决公共引擎与 Yi-Hot 扩展冲突。
4. 保留 `industry/`、品牌、来源、提示词、分类、邮件、公众号、用量管理和门户覆盖层。
5. 在全新测试数据库运行上游和 Yi-Hot 的全部迁移、测试与 smoke。
6. 用生产数据库备份副本彩排迁移，逐项对账文章、来源、总报、设置、人工覆盖和订阅。
7. 在 staging 验证 `/yihot/`、后台、API、RSS、邮件、WeRSS 和 `/futureme/`。
8. 再用一个更新后的上游提交演练第二次合并，证明以后仍能持续更新。
9. 完整备份并验证回滚后，单独安排生产切换；不在同步工作流里自动部署。

对齐后的常规命令是：

```bash
git remote add upstream https://github.com/KKKKhazix/AIHOT.git
git fetch upstream main
git switch rebuild/aihot-aligned
git merge --no-ff upstream/main
```

这组命令只适用于上游对齐分支，**不要在当前生产 `main` 上执行**。

### 自动同步权限

GitHub Actions 若需要同步上游包含 `.github/workflows/` 的提交，普通 `GITHUB_TOKEN` 不够，需要仓库范围的 `AIHOT_SYNC_TOKEN`，至少具备 Contents 和 Workflows 的读写权限。使用短期 fine-grained PAT 或权限明确的 GitHub App，保存为 Actions Secret，不写入代码、文档或聊天。

没有这个 Secret 时，工作流可以只检查并提示有更新，不能声称已经完成同步。

### 决定是否值得同步

优先吸收安全修复、数据库正确性、采集稳定性、模型兼容性和显著性能提升。纯 AI 行业示例、上游品牌、默认来源和不适用于公益场景的功能不应迁入。

每次同步都记录：上游 commit SHA、选择吸收的功能、主动跳过的内容、数据库影响、验证结果和回滚点。完整方案见 [`docs/AIHOT_UPSTREAM_REBUILD.md`](docs/AIHOT_UPSTREAM_REBUILD.md)。

## 十八、迁移到 NAS 或另一台服务器

### 能不能部署到 NAS

Yi-Hot 核心服务使用 Docker Compose，满足条件的 NAS 可以运行。当前整套生产还包含 WeRSS、邮件 systemd 定时器和 FutureMe，因此“核心站点能启动”不等于“全部功能已经迁移”。NAS 迁移需要逐项替代服务器能力。

### NAS 最低条件

- 支持 Docker/Container Manager 和 Compose；
- 建议至少 4GB 内存，若同时运行 WeRSS 和 FutureMe 建议 8GB；
- 至少 2 个 CPU 核心；
- 持久化存储建议预留 50GB，并启用磁盘健康和容量告警；
- 支持自动重启容器；
- 能配置域名、HTTPS 和反向代理；
- 能运行计划任务，或允许部署一个专门的定时任务容器；
- CPU 架构与所有镜像兼容。WeRSS 及其他第三方镜像尤其要核查 `amd64`/`arm64` 支持；
- 若放在家庭网络，必须考虑公网 IP、运营商入站限制、路由器端口转发和断电断网。

不建议把后台、PostgreSQL、WeRSS 管理端或 FutureMe 管理端直接暴露到公网。

### 推荐迁移顺序

1. 记录当前镜像、compose 文件、环境变量名和 volume 清单。
2. 导出 PostgreSQL 逻辑备份，并实际恢复到一套临时数据库验证。
3. 备份 `/opt/yihot/.env`、Yi-Hot 数据 volume、`/opt/werss/.env` 与 data、邮件服务配置和游标。
4. 在 NAS 建立独立测试目录和 Docker 网络，不占用生产端口。
5. 先只部署 PostgreSQL、setup、API、worker、web，使用测试域名验证核心 Yi-Hot。
6. 再迁移 WeRSS，确认镜像架构、登录 Cookie、feed 和内部网络。
7. 把两个 systemd timer 改为 NAS 计划任务或定时任务容器；保持单实例运行，防止重复采集或发信。
8. 最后迁移 FutureMe 和门户路由。
9. 配置 HTTPS、备份、日志轮转、时间同步和重启策略。
10. 完成全量 smoke 后再切换 DNS/端口；腾讯云至少保留一个可回滚周期。

### NAS 上的目录建议

```text
/volume/docker/yihot/
  app/                 仓库工作树
  env/yihot.env        主配置，权限仅管理员可读
  backup/postgres/     数据库备份
  email-source/        邮件采集配置与游标
  email-delivery/      邮件投递配置与游标
  werss/config/        WeRSS .env
  werss/data/          WeRSS SQLite、Cookie 和采集数据
```

实际路径随 NAS 品牌调整。不要把明文 `.env` 放进 NAS 的公开共享目录或自动同步到无加密的网盘。

### Compose 和定时任务适配

核心可以从 `docker-compose.yml` 开始。生产还需要按实际功能加入 `compose.werss.yml` 和 FutureMe 网络覆盖。NAS GUI 导入 Compose 时要确认它没有改写 volume 名、网络名、健康检查或 `stop_grace_period`。

Synology/QNAP 等 NAS 未必使用 systemd。邮件采集、邮件投递和微信读书兼容任务可以用 NAS 计划任务调用一次性容器，或新增常驻调度容器。无论采用哪种方式，都要满足：

- 同一任务同一时刻只有一个实例；
- 配置和状态目录持久化；
- 失败返回非零并留下日志；
- 任务升级后仍保留游标；
- 时区明确，周报/月报边界仍按项目口径；
- 邮件和采集凭据不出现在命令行参数和可见日志中。

### HTTPS 与域名

推荐使用 NAS 自带反向代理或独立 Caddy/Nginx，将公网 HTTPS 转发到 web 容器。`SITE_URL` 必须改成最终公开地址，例如 `https://example.org/yihot`；若代理负责访客 IP，正确配置受信任代理后再开启 `TRUST_PROXY`。不要为了省事把数据库端口映射到公网。

路径仍必须保留 `/yihot/` 尾斜杠规则，FutureMe 若继续挂在 `/futureme/`，还需保留对应 Docker 网络和 `FUTUREME_UPSTREAM_URL`。

### NAS 迁移验收

- [ ] `/yihot/api/health` 返回数据库正常；
- [ ] 首页、动态、主题、详情和总报正常；
- [ ] 后台匿名访问跳转，正确密码能登录；
- [ ] 公开 API、RSS 和订阅页正常；
- [ ] worker 能完成一次采集和分析；
- [ ] WeRSS feed 和公众号原文链接正常；
- [ ] 两个邮件任务各运行一次且没有重复；
- [ ] 周报/月报时区和周期正确；
- [ ] FutureMe 页面与管理端权限正确；
- [ ] 容器重启和 NAS 重启后数据、Cookie、游标、上传二维码仍存在；
- [ ] 数据库备份已在另一位置成功恢复；
- [ ] 旧服务器回滚步骤经过验证。

### 不建议迁移到 NAS 的情况

- NAS 只有 2GB 内存还要同时运行其他重服务；
- 使用 ARM CPU，但所需第三方镜像没有对应架构；
- 家庭网络经常断电、断网或没有可用入站连接；
- 没有异地备份；
- 无法限制管理端和配置目录权限；
- 无法提供稳定 HTTPS，或没有人负责系统和容器安全更新。

这种情况下继续使用云服务器，NAS 只承担加密备份，通常更稳妥。

## 十九、常见需求该改哪里

| 需求 | 首选入口 | 是否需要部署 |
| --- | --- | --- |
| 改关于页二维码 | 后台 → 设置 | 否，缓存后生效 |
| 开关飞书推送 | 后台 → 设置；凭据仍在 `.env` | 通常否；新增凭据需重建容器 |
| 调整付费调用次数上限 | 后台 → 设置 | 否 |
| 修改模型单价 | 后台 → 用量与成本 | 否 |
| 切换已有模型 | 后台 → 模型与评测 | 否；对应 Key 必须已配置 |
| 新增模型服务商 | 后端模型注册表和 `.env` | 是 |
| 新增 RSS/网站来源 | 后台 → 信源 → 新建 | 通常否 |
| 新增公众号 | WeRSS 添加账号，再在后台新增 RSS | 否；兼容层变化才部署 |
| 新增邮件简报 | 邮件白名单、解析测试、来源记录 | 是 |
| 修正一条标题或摘要 | 后台 → 内容诊断 | 否 |
| 批量修正日期/标签 | 一次性回填脚本和复核 | 是，先在备份副本试跑 |
| 新增公益领域或机构主题 | `industry/topics.json` 和相关映射 | 是，并 seed/迁移 |
| 改分类体系和提示词 | `industry/` 与样本测试 | 是 |
| 补历史周报/月报 | `scripts/recompose-period-history.ts` | 通常服务器执行，不改代码时无需构建 |
| 扩大发件规模 | 邮件投递器或专业邮件服务 | 是 |
| 修改后台密码或 API Key | 服务器 `.env` | 需要 `up -d` 重建配置 |
| 同步 AIHOT 新功能 | 上游隔离分支和 staging | 需要完整迁移与切换流程 |
| 搬到 NAS/新云服务器 | Compose、备份恢复、代理和定时任务 | 需要完整迁移 |

如果需求会改变分类、门槛、隐私条款、关注信源或品牌，由项目负责人先确认业务口径；如果只是修复明确故障、恢复服务或更新已批准来源，可以按本文流程直接处理。

## 二十、必须守住的安全边界

- 不提交 `.env`、`secrets/credentials.env`、邮箱授权码、后台密码、SSH 密码或 API Key。
- 不把生产密钥放入前端、浏览器存储、公开 API、Issue 或日志。
- 不直接改数据库日期、精选结果、费用或审计记录来掩盖问题。
- 不因一两次失败删除信源、内容或历史报告。
- 不在生产服务器保留没有回写仓库的临时代码修改。
- 不使用 `docker cp` 加 `restart` 作为正式部署。
- 不删除 Docker volume 解决普通启动问题。
- 不让测试访问真实模型、邮箱、飞书或生产数据库。
- 不绕过付费请求回执和预算熔断。
- 不让读者打开页面时触发模型调用。
- 不让前端直接读取数据库；公开出口使用统一 publication 读取层。
- 不开启全文展示，除非来源明确授权。
- 不删除 `LICENSE` 和 `NOTICE`，不使用 AIHOT 名称或 Logo 冒充官方项目。

## 二十一、专题文档索引

| 文档 | 用途 |
| --- | --- |
| [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) | 生产拓扑、内容口径、换机和接手 |
| [`docs/HANDOFF-2026-10-17.md`](docs/HANDOFF-2026-10-17.md) | 最近一轮生产状态与历史决策 |
| [`docs/memory/MEMORY.md`](docs/memory/MEMORY.md) | 运维经验索引 |
| [`docs/architecture.md`](docs/architecture.md) | 技术架构和数据流 |
| [`docs/deploy.md`](docs/deploy.md) | 通用部署方式 |
| [`docs/sources.md`](docs/sources.md) | 信源类型与配置格式 |
| [`docs/selection.md`](docs/selection.md) | 评分和门槛校准 |
| [`docs/AIHOT_UPSTREAM_REBUILD.md`](docs/AIHOT_UPSTREAM_REBUILD.md) | 上游 AIHOT 对齐、迁移和长期更新 |
| [`docs/WERSS_DEPLOY.md`](docs/WERSS_DEPLOY.md) | 公众号采集和扫码恢复 |
| [`docs/EMAIL_SOURCE_DEPLOY.md`](docs/EMAIL_SOURCE_DEPLOY.md) | 邮件信源采集 |
| [`docs/EMAIL_DELIVERY.md`](docs/EMAIL_DELIVERY.md) | 公开订阅和邮件投递 |
| [`tools/README.md`](tools/README.md) | 同步、部署和三方核查脚本 |
| [`secrets/README.md`](secrets/README.md) | 凭据加密、解密和换机 |
