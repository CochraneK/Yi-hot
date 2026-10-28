# docs/memory/ — 项目记忆的脱敏镜像

这里不是「另一套文档」，而是**开发机项目记忆的镜像**，存在的唯一目的是让
**换一台电脑、或换一个 AI 接手**时，经验不至于丢。

## 为什么需要镜像

项目的真实记忆（踩坑、口径、SOP、用量口径）在日常写作目录里的 `.workbuddy/memory/`，
而 `.workbuddy/` 在 `.gitignore` 里 —— **它永远不会进仓库**。结果是：`git clone`
之后只有代码、没有经验，接手者会重复踩已经踩过的坑。

所以把 `.workbuddy/memory/` 下的**常青分册 + 每日日志**全部脱敏后镜像到这里：

**常青分册（长期有效，改了口径要同步改）**

| 文件 | 内容 |
| --- | --- |
| `MEMORY.md` | 索引：跨会话必读的站点/部署铁律、内容口径、命名边界 |
| `OPS.md` | 运维：部署与同步流程、三方一致性、CI 离线审计门禁、本机资产 |
| `CONTENT.md` | 内容口径：发布时间 ≠ 收录时间、三层物化链、判定与门槛、时区健康 |
| `USAGE.md` | 用量与费用：`receipt_attempts` / `service_prices` → `/admin/usage` |
| `FutureMe.md` | 姊妹站 FutureMe（`/futureme/` 反代）的部署与改名备忘 |

**每日日志（`YYYY-MM-DD.md`，按日期升序）**

一次性的过程记录：当天做了什么、踩了什么坑、为什么改口径。时效性内容（当时的 IP、
临时文件路径、已修掉的 bug）读的时候要当**历史**看，别当现状。
价值在于「当时为什么这么定」——这类信息代码和 commit message 里都没有。

> 2026-10-28 决定把日志也一并镜像：用户要的是「删掉本地后换机器能完整接手」，
> 过程记录是其中最不可再生的部分（代码可 clone、经验不可）。

## 别直接编辑这里的文件

它们是**生成物**，由 `tools/sync_memory.py` 单向同步：

```
.workbuddy/memory/*.md   ──(脱敏)──▶   docs/memory/*.md
```

改法：改源文件 → 重跑

```sh
python tools/sync_memory.py          # 复制 + 脱敏 + 扫描
python tools/sync_memory.py --check  # 只扫描两侧，有疑似凭据则非零退出
```

同步时会做**两道脱敏/扫描**（`SSH_PASS` / `ADMIN_PASSWORD` / 裸「密码 `…`」/ 飞书
`cli_…`、`oc_…` / GitHub `gho_…` / `sk-…`）：先替换成占位符，再全量扫一遍；
**只要还扫到敏感串就中止、一个字节都不落盘**。所以即便源文件里误写了凭据，
也不会被带进仓库。

## 凭据不在这些文件里

所有凭据（服务器 `.env`、SSH 密码、GitHub token）走**加密归档**：
`secrets/credentials.env.enc` + `tools/secrets.sh`（一把口令）。见 `secrets/README.md`。

## 先读哪一份

接手时按这个顺序读：

1. **`docs/PROJECT_CONTEXT.md`** —— 交接总览（站点拓扑、部署、内容口径、上手步骤）。
2. `docs/memory/MEMORY.md` —— 索引，按需跳到下面几份。
3. 任务相关再读 `OPS.md` / `CONTENT.md` / `USAGE.md`。
4. 深度技术细节看 `docs/architecture.md`、`docs/deploy.md`、`docs/sources.md`、`docs/selection.md`。
