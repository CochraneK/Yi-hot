# WeRSS 扫码与巡检小工具（Windows）

三个文件，双击即用，不需要记命令：

| 文件 | 作用 | 什么时候用 |
| --- | --- | --- |
| `werss-scan.cmd` | 建 SSH 隧道 + 打开管理端 + 打印步骤 | **每 3 天**扫码时 |
| `werss-status.cmd` | 只读检查：凭据到期、每个号最后同步时间、最新文章日期 | 扫码后验收，或怀疑停更时 |
| `werss_status.py` | 状态命令本体（在容器内跑） | 由 `werss-status.cmd` 调用，不用手动跑 |
| `scan-instructions.txt` | 中文步骤提示，`werss-scan.cmd` 会打印出来 | 不用打开 |

## 前置条件（只需配一次）

1. 本机装了 Windows 自带 OpenSSH 客户端（`ssh -V` 有输出）。
2. 本机公钥已加入服务器 `~/.ssh/authorized_keys`。
3. `~/.ssh/config` 里有 `Host yihot`（HostName / User / IdentityFile）。
4. 服务器上放一份状态脚本：`sudo cp werss_status.py /opt/werss/`。

配好后 `ssh yihot "echo ok"` 应直接返回 `ok`，不再提示密码。

## 扫码流程（约 1 分钟）

1. 双击 `werss-scan.cmd`。
2. 浏览器打开的是**文章页**；若要求登录，账号密码在服务器 `/opt/werss/.env` 的 `ADMIN_` 开头项。
3. 点顶部**「刷新授权」**（扫描图标），用公众号管理员微信扫码。刷的是公众平台会话，有效期 4 天。
   **不要点「微信读书授权」**——那条路约 2 小时失效，已停用。
4. 左侧选中一个公众号 → 点顶部**「刷新」**→ 弹窗保持默认（第 0 页到第 1 页）→ 确定，看到「刷新成功，新增 N 篇」。每个号都做一次。
5. 双击 `werss-status.cmd` 确认：三个号都在 4 天内、最新文章日期是近期。
6. 关掉最小化的「WeRSS tunnel」窗口。

## 注意

- 会话是**登录后固定 4 天**过期，扫码不会延长已有会话，所以按 3 天一次留余量。
- **只扫码不点「刷新」，不会拉新文章**：WeRSS 本身没有定时抓取任务。
- 状态脚本只读；不会改数据库、不会触发采集。
- `.cmd` 文件保持纯 ASCII：cmd.exe 用 OEM 代码页解析批处理，中文会导致命令被拆断。中文提示放在 `scan-instructions.txt`，由 `chcp 65001` 后 `type` 输出。
