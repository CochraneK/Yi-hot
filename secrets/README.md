# secrets/ — 凭据加密归档（换机唯一需要带的东西）

这个目录让「换一台电脑继续做 Yi-Hot」只需要带**一个口令**，而不是手工搬 5 样凭据。

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `credentials.env.enc` | **提交进 git** | AES-256-CBC 密文。没有口令就是一堆随机字节，private/公开仓都无妨。 |
| `credentials.env` | **永不提交** | 明文。`.gitignore` 用白名单（`secrets/*` 全忽略，只放行 `.enc` 与 `README.md`），所以新文件默认是被挡住的。 |

## 一、怎么加密 / 解密

```sh
# 加密：凭据有变动后重跑，覆盖密文
bash tools/secrets.sh encrypt

# 解密：换设备时把密文还原成明文
bash tools/secrets.sh decrypt
```

两条命令都会**交互式询问口令**（输入不回显，要输两遍做确认）。口令不写进任何文件、不进 shell history、不进仓库。

参数固定为 `-aes-256-cbc -pbkdf2 -iter 300000 -salt`，写在 `tools/secrets.sh` 里，**两边必须一致**（改脚本就等于换一套加密格式，旧密文就解不开了）。

## 二、口令要求（这是整条链上唯一的单点）

- 用**密码管理器生成的 24 位**，或 **5 个词以上的长口令**（如 `harbor-lantern-quiet-otter-73`）。
- **不要**用 `yihot123` 这类；密文一旦被拿到，安全性完全取决于口令强度。
- 存进密码管理器，或至少记在一处与 git 仓库无关的地方。
- ⚠️ **口令丢失 = 密文报废**，只能回服务器 `/opt/yihot/.env` 和各仓库 `.git/config` 手工重取。

## 三、密文里包含什么

服务器 `/opt/yihot/.env` 的**全部内容**（`ADMIN_PASSWORD` / `SESSION_SECRET` / `IMG_PROXY_SIGN_SECRET` / `POSTGRES_PASSWORD` / `LLM_API_KEY` / 飞书三项 / `FUTUREME_UPSTREAM_URL` 等），外加三项不在 `.env` 里的：

| 键 | 用途 |
| --- | --- |
| `SSH_HOST` / `SSH_USER` / `SSH_PASS` | 部署与远程执行（`tools/deploy/sshexec.js` 从环境变量读） |
| `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_TOKEN` | 走 REST/Git Data API 推送（本机 `git push` 被代理拦，必用）。`tools/` 的脚本优先读 `GITHUB_TOKEN` 环境变量 |

## 四、换设备流程

```sh
git clone https://github.com/CochraneK/Yi-hot      # private，需要上面的 GITHUB_TOKEN
cd Yi-hot
bash tools/secrets.sh decrypt                      # 敲口令 → 得到 secrets/credentials.env
# 然后按 docs/PROJECT_CONTEXT.md §8 的第 2–5 步走
```

`docs/PROJECT_CONTEXT.md` §8 有完整的「新设备上手」清单；本目录是其中「凭据」那一格的落地方式。其余两格：`tools/README.md`（脚本）、`docs/memory/`（经验镜像）。

## 五、状态提示

已解密的明文 `credentials.env` **可以留在本地**（日常改凭据方便，`.gitignore` 会挡住），但：

- 改完凭据记得**重跑 `encrypt`**，否则密文是旧的（换机时就还原出过期值 —— 这和当年 `deploy/cloud.env` 差点覆盖生产 `.env` 是同一类事故）。
- ⚠️ **服务器 `/opt/yihot/.env` 才是运行时真值**。本归档是「换机备份」。改凭据的正规顺序是：改服务器 `.env` → `up -d` 生效 → 把新值同步进 `credentials.env` → 重新 `encrypt` → 提交密文。

## 六、没有 Git Bash 怎么办（本机专用小工具）

本机只装了 WorkBuddy 自带的**便携版 PortableGit**，没进开始菜单，所以搜不到。它在：

```
C:\Users\SCZ_2207\.workbuddy\binaries\PortableGit\versions\1.2.0\usr\bin\openssl.exe
```

`secrets\` 下另有两个**本机专用**的小工具（内含上面的绝对路径，**不入库**，被 `.gitignore` 挡住）：

| 文件 | 作用 |
| --- | --- |
| `encrypt-secrets.bat` | 双击 → 加密（出密文） |
| `decrypt-secrets.bat` | 双击 → 解密（换设备后还原明文） |

> 这两个 bat **不会跟着仓库走**。新设备上：若装了 Git for Windows，直接 `bash tools/secrets.sh decrypt`；若没有，把命令里的 openssl 换成新机路径即可，参数固定为
> `-aes-256-cbc -pbkdf2 -iter 300000 -salt`（解密时去掉 `-salt`，加 `-d`）。
