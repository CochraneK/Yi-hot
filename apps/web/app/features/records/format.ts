import type { RegulatoryOrgKind, RegulatoryRecordType } from "@aihot/contracts/records";

export const RECORD_TYPE_ORDER: RegulatoryRecordType[] = ["penalty", "dishonesty_enrol", "abnormal_enrol", "delivery", "dishonesty_remove", "abnormal_remove"];

export const RECORD_TYPE_LABELS: Record<RegulatoryRecordType, string> = {
  penalty: "行政处罚",
  dishonesty_enrol: "列入严重违法失信名单",
  abnormal_enrol: "列入活动异常名录",
  delivery: "送达公告",
  dishonesty_remove: "移出严重违法失信名单",
  abnormal_remove: "移出活动异常名录",
};

/** 图例、堆叠条、胶囊和卡片左缘共用的类型色，取值在 app.css 的 --rec-* 里（含深色主题）。 */
export const RECORD_TYPE_COLORS: Record<RegulatoryRecordType, string> = {
  penalty: "var(--rec-penalty)",
  dishonesty_enrol: "var(--rec-dishonesty)",
  abnormal_enrol: "var(--rec-abnormal)",
  delivery: "var(--rec-delivery)",
  dishonesty_remove: "var(--rec-remove-dishonesty)",
  abnormal_remove: "var(--rec-remove-abnormal)",
};

/** 概览图例里的简称：全称在图例和胶囊上都排不进一行。 */
export const RECORD_TYPE_SHORT: Record<RegulatoryRecordType, string> = {
  penalty: "行政处罚",
  dishonesty_enrol: "列入失信名单",
  abnormal_enrol: "列入异常名录",
  delivery: "送达公告",
  dishonesty_remove: "移出失信名单",
  abnormal_remove: "移出异常名录",
};

/**
 * 概览的三组：变糟 / 程序性 / 恢复。分组的用处不只是好看——两列平铺时人会竖着读，
 * 七个数字竖着读会串成「处罚、列入异常、移出失信」这种没有意义的序列；按组排，竖读的每一列
 * 本身就是一件事，横条的配色也有了说法（红 → 琥珀 → 灰 → 绿）。
 */
export const RECORD_TYPE_GROUPS: { key: string; label: string; types: RegulatoryRecordType[] }[] = [
  { key: "worse", label: "变糟", types: ["penalty", "dishonesty_enrol", "abnormal_enrol"] },
  { key: "procedural", label: "程序性", types: ["delivery"] },
  { key: "recover", label: "恢复", types: ["dishonesty_remove", "abnormal_remove"] },
];

export const ORG_KIND_LABELS: Record<RegulatoryOrgKind, string> = {
  social_group: "社会团体",
  private_non_enterprise: "民办非企业单位",
  foundation: "基金会",
};

export const ORG_KINDS: RegulatoryOrgKind[] = ["foundation", "social_group", "private_non_enterprise"];

/** 一条记录的「主句」：这个组织发生了什么。 */
export function headline(r: { type: RegulatoryRecordType; punishResult: string | null; enrolReason: string | null; removeReason: string | null }): string {
  switch (r.type) {
    case "penalty":
      return r.punishResult ? `被处${r.punishResult}` : "受到行政处罚";
    case "dishonesty_enrol":
      return r.enrolReason ? `因${r.enrolReason}，列入严重违法失信名单` : "列入严重违法失信名单";
    case "abnormal_enrol":
      return r.enrolReason ? `因${r.enrolReason}，列入活动异常名录` : "列入活动异常名录";
    case "dishonesty_remove":
      return r.removeReason ? `因${r.removeReason}，移出严重违法失信名单` : "移出严重违法失信名单";
    case "abnormal_remove":
      return r.removeReason ? `因${r.removeReason}，移出活动异常名录` : "移出活动异常名录";
    case "delivery":
      return r.enrolReason ? `因${r.enrolReason}，被公告送达列入决定` : "被公告送达列入决定";
  }
}

export function monthDay(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日`;
}
