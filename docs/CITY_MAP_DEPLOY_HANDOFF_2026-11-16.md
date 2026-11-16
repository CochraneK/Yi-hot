# 城市功能：腾讯云部署与实际数据验收交接

这是一份接手清单，**不是已部署证明**。主线以合并后的 GitHub main 为准，不使用废弃的地图实验分支，也不覆盖 WorkBuddy 在其他设备的新修改。

## 可复制给有腾讯云连接的 WorkBuddy

> 接手 CochraneK/Yi-hot 城市功能。先读 AGENTS.md、docs/PROJECT_CONTEXT.md、docs/CITY_MAP_RELEASE_2026-11-16.md 和本文件，连续执行到部署和验收完成。核对最新 main、已合并城市地图PR及GitHub CI（包括Docker离线Chromium检查）都通过；按现有 tools 的blob校验方式对齐本地、GitHub和腾讯云 /opt/yihot，保留并逐项整合其他会话修改，不强制覆盖。服务器 .env 是运行时真值，不使用开发机旧副本、不打印任何凭据、不改模型/采集/预算开关。先备份数据库，再用服务器现有 docker-compose.yml、compose.futureme-proxy.yml、compose.werss.yml 组合重建并启动。确认0052地理迁移存在；不初始化空库、不删除卷、不自动批准真实地点。已有AI地点输出只经 backfill-geo-candidates.ts 预览后分批写入pending；逐条核对原文和发生地后，才能经后台人工审核。验收城市页/附近/国家地区筛选/地图/当地标签、旧链接、后台认证与CSRF，记录真实底图/IP可达性及最少100条真实新闻的地点质量与覆盖率。遇到缺少来源或坐标的候选保持pending或驳回，不编造地点。把实际部署commit、备份位置、迁移状态、样本结果、故障和回滚证据写进Git的脱敏交接，区分代码CI通过、已部署和真实数据通过，不把其中一个当另一个。

## 执行顺序

1. 读取既有运维记录和服务器compose组合，确认 /opt/yihot 的运行镜像、发布版本、本地/远端工作区差异；有未合入内容则先做可恢复快照并整合。**不要直接 reset --hard/clean 或用旧代码打包覆盖。**
2. 把带时间戳的数据库备份写到服务器受限目录并核实文件非空，记录文件位置和摘要，不上传新闻原文、数据库、.env或密码到Git。
3. 当前服务器路径和compose组合以 `docs/PROJECT_CONTEXT.md` §2 为准。已核对并同步文件后：

```bash
cd /opt/yihot
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml build
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml up -d
```

4. 核对 setup 迁移成功、API health、Web/worker运行日志、容器镜像/代码blob；如0052未迁移按既有setup流程完成。无0052不能启动这次公开地点读取。
5. 先运行 `node scripts/backfill-geo-candidates.ts --after=0 --limit=100` 的dry-run；写入时只加 `--apply`，保存 lastAnalysisId 后显式分批继续。应在已有授权的管理容器/数据库环境内执行。工具本身不会调用模型，也不批准地点；没有已保存 geography 的新闻不能补造AI输出。
6. 打开 `/yihot/admin/geo`：核对原文、当前分析/版本、事件角色、标准地点和坐标来源，登记缺少的地点后逐条审核。不能把机构地址、发布地、全国政策覆盖范围直接标成事件城市；模糊情况保持pending。
7. 至少取100条真实新闻，覆盖有地点/无地点、发布者地址、跨市、省级、海外、改版、撤稿等。记录有无AI候选、候选角色是否正确、证据是否支持事件地、标准地点是否正确、是否上图和被排除的原因。给出分母，区分准确率与覆盖率；不把“没上图”算成“当地没有新闻”。不把这些真实原文全文写进Git。
8. 验收 `/yihot/cities` 默认审核视图；按国家/省份筛选、跨页地图计数；设置城市看25/100/300公里范围；IP不可用时手动选择；地图不加载及底图不可达的列表回退；对应卡片当地标签和机构名不误标；`?city=chengdu` 与 `?city=chengdu&reviewed=1` 兼容。
9. 新版HTML应出现地图按钮且默认不访问第三方；点击后标记可操作，瓦片有可见OSM署名且Referer不含筛选参数。检查手机320/390px与桌面，无横向溢出，反复开关、换地区不出现重复地图或客户端异常。真实服务连接受限应记录原因，不伪造成功。
10. 保存脱敏验收记录；若异常回滚上一镜像/代码，不删地理表或卷，错误地点通过后台重新打开，保留审核日志。

## 本会话的状态

- 此环境没有腾讯云SSH凭据，未执行生产连接、迁移、历史回填、真实新闻批准或付费调用。
- CI数据库、合成HTTP、离线Chromium检查只证明代码路径；不能替代上述真实数据验收。
- 需要记录实际上线时间与发布commit后，才能标为腾讯云已完成。
