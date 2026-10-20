// 监管记录同步的一次性入口：拉取民政部行政处罚与异常名录/严重失信公告，写入 regulatory_records。
// 日常同步由 worker 的 cron（records.mca-sync）负责；这个脚本用于首次回填或手动补跑。
// upsert 幂等，重复跑没有副作用。
import { syncMcaRecords } from "@aihot/backend/records/sync";
import { closeDb } from "@aihot/backend/db";

const result = await syncMcaRecords();
console.log(JSON.stringify(result));
await closeDb();
