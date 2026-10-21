# YiHot 默认模型切换：DeepSeek V4.1 Flash（2026-10-21）

**状态：GitHub 已具备正确示例与模型适配；腾讯云生产切换必须在服务器执行，不能从 GitHub 合并推断线上已经生效。**

## 官方依据与目标

- DeepSeek 于 2026-09-10 公告 V4.1 Flash 的正式 API 模型名称是 `deepseek-flash`，旧 `deepseek-chat`、`deepseek-reasoner` 已在 2026-07-24 退役：<https://www.deepseek.com/en/news/deepseek-v4-1-flash/>。
- OpenAI-compatible Chat Completions 使用 `model=deepseek-flash`；请求附加 `thinking: { type: "disabled" }` 为非思考模式：<https://api-docs.deepseek.com/api/create-chat-completion/>。
- YiHot 生产历史（截至 2026-10-18）为 `LLM_MODEL=deepseek-chat`；当前腾讯云真实 `.env` **尚未读取确认**。
- `.env.example` 早已默认 `deepseek-flash`，但不会覆盖存在的生产 `.env`。

目标：将现网 **默认** 模型换为 `deepseek-flash`，保持现有 `LLM_API_KEY` 不变，关闭思考，不触发历史内容重算；保留各阶段专门设置和后台审核历史。

## 腾讯云切换（在服务器 /opt/yihot 操作）

1. 确保服务器上的本仓库同步到包含 `tools/switch_deepseek_flash.py` 的最新 `main`；**不要以覆盖 `.env` 的方式同步代码**。先按 [交接与三方同步说明](PROJECT_CONTEXT.md) 和 [tools/README.md](../tools/README.md) 解决开发机与服务器版本差异。
2. 先只读检查：

   ```sh
   cd /opt/yihot
   python3 tools/switch_deepseek_flash.py
   ```

3. 确认 `LLM_BASE_URL` 是 DeepSeek 官方 `https://api.deepseek.com/v1` 且旧密钥仍有效后，执行：

   ```sh
   cd /opt/yihot
   python3 tools/switch_deepseek_flash.py --apply
   ```

   脚本会做 `sudo -n docker compose ... config --services` 预检；在被 `.gitignore` 忽略的 `.data/backups/model-switch/` 下创建 `.env` 私密备份；仅替换 `LLM_MODEL` 与 `LLM_EXTRA_JSON`；仅重建 API 与 Worker 两容器（`--no-deps --force-recreate`，不重建数据库或 Web）；分别读取其 `LLM_MODEL` 进行验证。失败时尝试自动恢复原配置及容器。**脚本不读取或输出 API Key 本文值，不做任何收费模型测试调用。**

4. 去后台 `/yihot/admin/models` 查看每个环节来源。系统模型优先级为**后台 settings 覆盖 > 每环节 `*_MODEL` 环境变量 > `LLM_MODEL` 默认**。如果有人在后台为某个环节手动指定了其他模型，切换默认值不会覆盖原选择；经质检再决定是否手动切换。
5. 打开 `/yihot/admin/usage` 观察**实际在用**模型是否从 `deepseek-chat` 转到 `deepseek-flash`。只有下一次合法的新分析任务发生后，才会出现新模型回执；不要为了制造回执而强制重算历史文章。
6. 在 `service_prices` 核对 `service=llm`、`model=deepseek-flash`，或者 `model=""` 的兜底价。按 2026-10-21 官方峰时标准，USD 输入未缓存 $0.30/百万、命中缓存 $0.006/百万、输出 $1.20/百万；非峰时可能是这些价格的一半。后台单价估算未内置时段差异或真实缓存命中拆分，因此**账单实际扣费以 DeepSeek 控制台为准**；不要仅仅修改美元/人民币符号，也不要删除旧 `deepseek-chat` 价格（它用于解释历史账单）。

## 失败回滚

切换前的私密原配置备份在 `/opt/yihot/.data/backups/model-switch/env-before-flash-<时间>.bak`（权限为 0600，含密钥，不可提交）。若需手动恢复：

```sh
cd /opt/yihot
# 将实际备份路径替换进下一行；勿对外展示、复制其中任何敏感变量
cp '/opt/yihot/.data/backups/model-switch/env-before-flash-YYYYMMDDTHHMMSSZ.bak' .env
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml up -d --no-deps --force-recreate api worker
```

如果部署目录没有 `compose.futureme-proxy.yml`，请移除该 `-f` 参数。保持 `.env` 权限 0600。回滚后检查后台模型状态和新回执，避免反复重试产生新收费；再将有效模型配置同步到加密凭据归档（参照 [凭据保存规则](PROJECT_CONTEXT.md) §7）。

## 需要区分

- **GitHub 合并**：提供脚本、测试和操作文档，不等于腾讯云执行成功。
- **服务器 `.env` 更新 + Compose 重建**：默认模型生效，仅对未来任务起作用。
- **后台模型手动覆盖**：优先级更高，本工具不篡改既有审计记录。
- **费用变化**：Flash 本来就是官方低价档；由老别名切到 Flash 不意味着同用量账单必然下降，真正省钱通常来自缓存、空闲时段与减少重复无效调用。
