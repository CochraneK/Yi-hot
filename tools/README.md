# tools/ — 仓库运维工具

这里放**同步 / 部署 / 核查**用的脚本。它们原先散落在开发机的 `D:\Software\DSH\`，
不属于任何仓库，于是**换机器或换 AI 接手时就丢了**。现在搬进仓库，并且把里面的
「开发机专属硬编码」（仓库路径、token 位置）改成了**环境变量可覆盖**，clone 下来即可用。

> 日常改动**不需要**这些脚本也能做（`git` + `scp` + `ssh` 就够，见 `docs/deploy.md`）。
> 它们存在的意义是**省事**，以及记录本机网络环境下唯一走得通的推送路径。

## 三样配置（都可选，不设就用默认）

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `YIHOT_ROOT` | 本地仓库根 | 本目录（`tools/`）的上一级 |
| `YIHOT_WORK` | 中间产物（`_gh_map.json` 等）落盘目录 | 仓库根的**上一级**（刻意不落仓库内，防误提交） |
| `GITHUB_TOKEN` | GitHub PAT（fine-grained，需 Yi-hot `Contents: read/write`） | 依次回退 `GH_TOKEN` → 本地若干仓库 `.git/config` 里内嵌的 `gho_…`（**开发机便利路径，新设备上没有**） |

⚠️ 本机网络环境下 **`git push` / `git fetch` 走不通**（出口代理只放行 `api.github.com`，
`github.com` 的 git smart-HTTP 被拦，报 502）。所以推送一律走 **REST / Git Data API**——
下面这些 `sync.py` / `delete.py` 就是干这个的。

## 工具清单

| 脚本 | 来自 | 作用 |
| --- | --- | --- |
| `yihot_common.py` | 新增 | 共享：仓库根 / token / 中间产物目录 / blob sha |
| `sync.py` | `_sync_yihot.py` | **增改文件并推送到 GitHub main**（`python tools/sync.py -m "…" <路径…>`；**无删除能力**） |
| `delete.py` | `_delete_yihot.py` | 从 GitHub main 删除指定路径（`python tools/delete.py -m "…" <路径…>`；自带「删除前后全量 path→blob-sha 对照」安全闸门） |
| `pull.py` | `_pull_yihot.py` | 从 GitHub main 拉回本地（只覆盖有差异/缺失的路径，逐个校验 blob sha） |
| `compare.py` | `_cmp_yihot.py` | **只读**比对：GitHub main vs 本地（远端独有 / 本地独有 / 内容不同） |
| `verify_threeway.py` | `_verify_yihot_threeway.py` | 三方核查第一段：GitHub + 本地 → 产出 `_gh_map.json` / `_local_map.json` |
| `server_diff.py` | `_server_diff_full.py` | 三方核查第二段（**在服务器上跑**）：比对 `/opt/yihot`，产出 `/tmp/_upload_manifest.txt` |
| `verify_fm_threeway.py` | `_verify_fm_threeway.py` | FutureMe（姊妹站）三方核查 |
| `ci_status.py` | `deploy/_ci_status.py` | 查 GitHub Actions：默认列 check-runs，`--steps` 逐 job 逐 step，`--log` 拉失败 job 日志，`--annots` 查注解 |
| `secrets.sh` | 新增 | 凭据归档的加解密（见 `../secrets/README.md`） |
| `sync_memory.py` | 新增 | 把 `.workbuddy/memory/` 的 5 个常青分册脱敏镜像到 `docs/memory/`（`--check` 只扫描） |
| `deploy/sshexec.js` | `deploy/sshexec.js` | 远程执行（`SSH_PASS=… node sshexec.js '<cmd>'`；密码只从环境变量读） |
| `deploy/sftp-upload.js` | 同名 | 单文件上传 |
| `deploy/sftp-upload-many.js` | 同名 | 按清单批量上传（单连接） |
| `legacy/push_full.py` | `_push_yihot.py` | 历史：全量首推 |
| `legacy/finish_push.py` | `_finish_yihot.py` | 历史：补完一次中断的推送 |
| `legacy/repair_tree.py` | `_repair_yihot.py` | 历史：「误把 `apps/` 子树提到仓库根」事故的修复 |

`deploy/*.js` 需要依赖 `ssh2`，本机装在工作区 `node_modules` 里，运行时给 `NODE_PATH`：
`SSH_PASS=… NODE_PATH='<node workspace>/node_modules' node tools/deploy/sshexec.js '<cmd>'`。
`sshexec.js` 的命令**不能含单引号**（要跑 SQL/脚本就传文件上去再执行），也不能含 `||`。

> ⚠️ `tools/deploy/package.json`（内容只有 `{"type":"commonjs"}`）是**必需**的：仓库根的
> `package.json` 声明了 `"type": "module"`，Node 又取「最近的那个 package.json」，
> 所以少了它这几个用 `require` 的部署脚本会被当 ESM 跑、直接报
> `require is not defined in ES module scope`。**不要删。**

## 常用工作流

```sh
# 1) 改完东西，推送到 GitHub
#    先跑 compare.py 看「本地独有 + 内容不同」是哪几组，把它们拼成清单
python tools/compare.py
python tools/sync.py -m "一句话说清改了什么、为什么" --changed-from /tmp/changed.txt
#    或者直接列路径：
#    python tools/sync.py -m "…" docs/PROJECT_CONTEXT.md tools/sync.py

# 2) 只读看看本地和远端差在哪
python tools/compare.py

# 3) 三方一致性：本地 ≡ GitHub ≡ 腾讯云
python tools/verify_threeway.py                       # 本机：GitHub + 本地
#   把 _local_map.json / server_diff.py 传到服务器，在服务器上跑 server_diff.py
#   再取回 /tmp/_upload_manifest.txt 交给 deploy/sftp-upload-many.js

# 4) 补齐服务器（文档/工具这类非运行时文件不用 rebuild）
cd tools/deploy && SSH_PASS=… node sftp-upload-many.js <manifest>
#   改了 industry/、data/ 或代码才需要：sudo -n docker compose -f docker-compose.yml \
#   -f compose.futureme-proxy.yml build && … up -d
```

## 与开发机旧脚本的关系

`D:\Software\DSH\` 下那份 `_*.py` / `deploy/` **仍然保留**（别的项目也在用，比如
`_push_api.py` 是给 Scholar4C 的）。但**从 2026-10-09 起，Yi-hot 的唯一真值是本目录**；
以后改同步逻辑改这里，别再改开发机那份，免得两处漂移。
