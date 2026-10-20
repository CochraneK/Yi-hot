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

/** 严重程度高的用红，预警用琥珀，恢复（移出）用绿，送达用中性。 */
export const RECORD_TYPE_TONES: Record<RegulatoryRecordType, string> = {
  penalty: "bg-hot-soft text-hot ring-hot/25",
  dishonesty_enrol: "bg-hot-soft text-hot ring-hot/25",
  abnormal_enrol: "bg-amber-soft text-amber-ink ring-amber/25",
  delivery: "bg-bg-sunk text-ink-3 ring-line",
  dishonesty_remove: "bg-ok/10 text-ok ring-ok/20",
  abnormal_remove: "bg-ok/10 text-ok ring-ok/20",
};

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
