// 把归档的稿子放回处理队列。
//
//   node scripts/requeue-archived.ts                 # 全部原因，最多 200 篇
//   node scripts/requeue-archived.ts quota 500       # 只放回配额挡下的，最多 500 篇
//
// 归档不是删除：原文、来源、发现时间都还在库里，只是没有花钱分析。放回时会跳过容量闸门
// （人已经明确说「这些要」，但每日配额对后续自动流水仍然有效）。
import { closeDb } from "@aihot/backend/db";
import { requeueArchived } from "@aihot/backend/jobs/content.ts";

const reason = process.argv[2] && process.argv[2] !== "all" ? process.argv[2] : null;
const limit = Number(process.argv[3] ?? 200);

const { requeued } = await requeueArchived(reason, Number.isFinite(limit) && limit > 0 ? limit : 200);
console.log(`放回队列 ${requeued} 篇${reason ? `（原因 ${reason}）` : "（全部原因）"}`);
await closeDb();
