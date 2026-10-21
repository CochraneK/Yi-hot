// 监管记录域 DTO：民政部行政处罚与全国社会组织活动异常名录 / 严重违法失信名单公告。
// 数据来自中国社会组织政务服务平台（chinanpo.mca.gov.cn）公开接口，只精确到日。

export type RegulatoryRecordType =
  | "penalty"
  | "abnormal_enrol"
  | "abnormal_remove"
  | "dishonesty_enrol"
  | "dishonesty_remove"
  | "delivery";

/** 组织类型，由统一社会信用代码前两位推导。 */
export type RegulatoryOrgKind = "social_group" | "private_non_enterprise" | "foundation";

export interface RegulatoryRecord {
  /** `${source_key}:${external_id}`，列表内唯一。 */
  id: string;
  type: RegulatoryRecordType;
  orgName: string;
  unifiedCode: string | null;
  orgKind: RegulatoryOrgKind | null;
  /** 命中行业实体词典时的实体 id（展示标签用）。 */
  entityId: string | null;
  /** entityId 对应的展示名（实体词典的 displayTag）。 */
  entityName: string | null;
  region: string | null;
  /** 归一化后的省/直辖市/自治区简称（如"黑龙江"），脏数据或处罚记录为 null。 */
  regionProvince: string | null;
  /** 归一化后的市/地区/自治州（如"佳木斯市"），省直管或脏数据为 null。 */
  regionCity: string | null;
  caseNo: string | null;
  punishName: string | null;
  punishResult: string | null;
  punishReason: string | null;
  punishBasis: string | null;
  punishOrgan: string | null;
  punishOn: string | null;
  enrolReason: string | null;
  enrolGist: string | null;
  enrolOn: string | null;
  removeReason: string | null;
  removeGist: string | null;
  removeOn: string | null;
  registerDept: string | null;
  address: string | null;
  /** 公告发布日（YYYY-MM-DD）；处罚记录取处罚决定日。 */
  publishedOn: string;
  /** 上游公示页面。 */
  sourceUrl: string;
}

export interface RegulatoryRecordStats {
  total: number;
  byType: Record<RegulatoryRecordType, number>;
  /** 各省份记录数（降序）；按省筛选时为全部有省份的记录，不随当前筛选收缩。 */
  provinces: { province: string; n: number }[];
  /** 选中省份下的各市记录数（降序）；未选省份时为空。 */
  cities: { city: string; n: number }[];
  /** 最近一次成功同步的时间（ISO）；从未同步过为 null。 */
  lastSyncedAt: string | null;
}

export interface RegulatoryRecordsPage {
  items: RegulatoryRecord[];
  total: number;
  page: number;
  pageSize: number;
  stats: RegulatoryRecordStats;
  generatedAt: string;
}
