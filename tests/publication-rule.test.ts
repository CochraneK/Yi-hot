// 按源的内容规则（sources.publication_rule，迁移 0042）对着 2026-10-20 实测的 31 条小红书样本校准：
// 人物故事靠分数硬线进，机构动态/政策靠更低的类别线加主体词进，个人募捐征集一律拦。
// 样本取自 source=xhs-search-charity-project 的真实分析结果（score / category / 中文标题）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { isPoolEligible, passesPublicationRule, type PublicationRule } from "@aihot/backend/publication/rules";

const RULE: PublicationRule = {
  minScore: 40,
  scoreByCategory: { project: 20, policy: 18 },
  requireMarkers: ["基金会", "协会", "学会", "团委", "妇联", "红十字会", "慈善会", "公益项目", "救助项目", "计划", "政策", "通知", "公示", "政府"],
  dropCategories: ["fundraising"],
};

/** [分数, 类别, 中文标题, 该不该进] */
const SAMPLE: Array<[number, string, string, boolean]> = [
  [50, "field", "白方礼退休后蹬三轮18年，攒35万元资助三百多名寒门学子", true],
  [40, "field", "福建匿名企业家13年捐资助学帮扶550名困境学子", true],
  [20, "field", "助学金能和奖学金同时拿吗？", false],
  [18, "field", "武汉线下公益头疗：在见山舍门口为街坊做调理", false],
  [15, "field", "资助山区贫困学生的第三年", false],
  [15, "field", "免费带娃运动，公益“放电局”真香了！", false],
  [12, "field", "可以说原生家庭不好 但不能说咱妈不好", false],
  [12, "field", "美的积分公益活动板块上线五个公益方向，涵盖儿童研学与非遗手作", false],
  [10, "field", "邱俊阳24岁生日公益应援：树木认养传递善意", false],
  [8, "field", "短期志愿者", false],
  [8, "field", "一聊到咱妈的福利，也是发狠了忘情了#补助 #孤儿 #原生家庭 #娱乐评论大赏", false],
  [40, "project", "福建“爱·福蕾”项目为0-18周岁困境儿童提供最高1.5万元大病救助", true],
  [22, "project", "花都这场体验营，让善意变成看得见的支持~", false],
  [22, "project", "深圳市幸福慈善基金会支持“益小时”志愿者开展儿童美育课堂", true],
  [20, "project", "深圳市鹏博爱心互助协会携手秦安县团委开展困境学生走访前会议", true],
  [20, "project", "小红书公益「未来启航计划」助学项目：1470 万善意守护大山孩子上学梦", true],
  [18, "project", "益健年“星光长明助学计划”公益行", false],
  [12, "project", "粉丝团“爱的分贝”公益项目应援", false],
  [12, "project", "金鸡湖天虹 × 川流美发重阳敬老公益义剪活动开启", false],
  [12, "project", "Xanadu Laser Therapies 推出 Fresh Start Program", false],
  [18, "policy", "民政领域：孤儿及事实无人抚养儿童政策", true],
  [18, "fundraising", "冬日暖阳·爱心征集：闲置冬衣与图书公益物资征集", false],
  [12, "fundraising", "寻找爱心资助人：一对一资助大山里的孩子", false],
  [8, "fundraising", "冬日暖阳·爱心征集", false],
];

test("按源规则回测 31 条实测样本：放行的正好是那 7 条", () => {
  const passed = SAMPLE.filter(([score, category, title]) => passesPublicationRule(RULE, { score, category, title, summary: null }));
  assert.deepEqual(
    passed.map(([, , title]) => title),
    [
      "白方礼退休后蹬三轮18年，攒35万元资助三百多名寒门学子",
      "福建匿名企业家13年捐资助学帮扶550名困境学子",
      "福建“爱·福蕾”项目为0-18周岁困境儿童提供最高1.5万元大病救助",
      "深圳市幸福慈善基金会支持“益小时”志愿者开展儿童美育课堂",
      "深圳市鹏博爱心互助协会携手秦安县团委开展困境学生走访前会议",
      "小红书公益「未来启航计划」助学项目：1470 万善意守护大山孩子上学梦",
      "民政领域：孤儿及事实无人抚养儿童政策",
    ],
  );
  for (const [score, category, title, want] of SAMPLE) {
    assert.equal(passesPublicationRule(RULE, { score, category, title, summary: null }), want, `${score} ${category} ${title}`);
  }
});

test("没有规则时任何材料都照旧放行", () => {
  assert.equal(passesPublicationRule(null, { score: 3, category: "field", title: "随便", summary: null }), true);
  assert.equal(passesPublicationRule(undefined, { score: null, category: null, title: null, summary: null }), true);
});

test("拦截优先于分数硬线：个人募捐分再高也不放行", () => {
  assert.equal(passesPublicationRule(RULE, { score: 95, category: "fundraising", title: "为患儿募捐", summary: null }), false);
});

test("类别线只在文字点出机构或项目时生效", () => {
  assert.equal(passesPublicationRule(RULE, { score: 22, category: "project", title: "一场温暖的体验营", summary: null }), false);
  assert.equal(passesPublicationRule(RULE, { score: 22, category: "project", title: "某某协会开展走访", summary: null }), true);
  // 主体词出现在摘要里也算
  assert.equal(passesPublicationRule(RULE, { score: 20, category: "project", title: "一场温暖的体验营", summary: "由当地基金会支持" }), true);
});

test("postgres 的 numeric 以字符串返回时照样能比较", () => {
  assert.equal(passesPublicationRule(RULE, { score: "50.00", category: "field", title: "白方礼", summary: null }), true);
  assert.equal(passesPublicationRule(RULE, { score: "12.00", category: "field", title: "白方礼", summary: null }), false);
});

test("isPoolEligible 把源规则接在原有四个条件之后", () => {
  const base = { participationMode: "editorial", relevance: "pass", title: "标题", summary: "摘要" };
  assert.equal(isPoolEligible({ ...base, rule: RULE, score: 50, category: "field" }), true);
  assert.equal(isPoolEligible({ ...base, rule: RULE, score: 12, category: "field" }), false);
  // 非 editorial 的源仍被 participation_mode 拦住，规则救不回来
  assert.equal(isPoolEligible({ ...base, participationMode: "hot_signal", rule: RULE, score: 50, category: "field" }), false);
  // 没有规则时也要过全局分数地板（2026-10-21 起 15 分以下不进动态）
  assert.equal(isPoolEligible({ ...base, score: 12, category: "field" }), false);
  assert.equal(isPoolEligible({ ...base, score: 15, category: "field" }), true);
});

test("全局分数地板：15 分以下不进动态，null 分与人工覆盖照旧", () => {
  const base = { participationMode: "editorial", relevance: "pass", title: "标题", summary: "摘要" };
  assert.equal(isPoolEligible({ ...base, score: 14 }), false);
  assert.equal(isPoolEligible({ ...base, score: 15 }), true);
  // 不参与评分的信源没有分数，不能被地板误伤
  assert.equal(isPoolEligible({ ...base, score: null }), true);
  assert.equal(isPoolEligible({ ...base }), true);
  // 编辑手动覆盖过的条目不受地板限制
  assert.equal(isPoolEligible({ ...base, score: 0, overridden: true }), true);
  // 相关性这一关始终在分数地板之前
  assert.equal(isPoolEligible({ ...base, relevance: "unknown", score: 80 }), false);
});
