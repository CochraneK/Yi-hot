import { Link } from "react-router";
import { IconArrowRight } from "../../components/icons";

/**
 * The editorial pipeline, drawn as it actually runs:
 *   collect -> dedupe -> prefilter -> understand -> score -> select -> publish
 * Every node states what it decides and what it throws away, because the honest
 * answer to "why isn't my article here" is almost always one of these gates.
 * Kept as a plain CSS diagram (no chart library) so it renders identically on the
 * server and after hydration, and stays legible in the page's light theme.
 */

type Gate = {
  /** Short label shown inside the node. */
  label: string;
  /** What this step consumes. */
  reads: string;
  /** What it decides. */
  decides: string;
  /** What falls out here, stated plainly. */
  drops: string;
  /** Accent index, 0-based, matching GATE_TINTS. */
  tone: number;
};

const GATES: Gate[] = [
  { label: "采集", reads: "20 个信源", decides: "按栏目抓取列表页", drops: "—", tone: 0 },
  { label: "去重", reads: "标题 + 正文指纹", decides: "同一件事只留一篇", drops: "重复报道", tone: 1 },
  { label: "预筛", reads: "标题 + 摘要", decides: "是否与公益相关", drops: "与公益无关的内容", tone: 2 },
  { label: "理解", reads: "正文全文", decides: "抽出主体、时间、事实", drops: "—", tone: 3 },
  { label: "打分", reads: "事实 + 领域", decides: "重要性与噪声压制", drops: "低分内容", tone: 4 },
  { label: "精选", reads: "分数 + 时效", decides: "进不进首页", drops: "多数内容", tone: 5 },
  { label: "发布", reads: "入选文章", decides: "上架、归档、入日报", drops: "—", tone: 6 },
];

const GATE_TINTS = [
  "border-line-strong",
  "border-line-strong",
  "border-line-strong",
  "border-accent/40",
  "border-accent/55",
  "border-accent",
  "border-accent",
];

export function PipelineFlow({ className = "" }: { className?: string }) {
  return (
    <figure className={`mt-10 xl:mt-14 ${className}`}>
      <figcaption className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[12px] font-semibold tracking-[0.2em] text-accent">内容流转</span>
        <span className="text-[14px] font-bold text-ink">一条动态要过七道闸门</span>
        <span className="text-[13px] text-ink-4">每一道都有取舍，越往后越少。</span>
      </figcaption>

      <ol className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {GATES.map((g, i) => (
          <li key={g.label} className="relative">
            {/* connector: a rule between nodes on wide screens, an arrow on narrow ones */}
            {i < GATES.length - 1 && (
              <span
                aria-hidden
                className="absolute left-6 top-[calc(50%+18px)] hidden w-px bg-line-strong lg:block"
                style={{ height: "calc(100% - 8px)" }}
              />
            )}
            <div className={`h-full rounded-xl border bg-surface px-5 py-4 ${GATE_TINTS[g.tone]}`}>
              <div className="flex items-center gap-2.5">
                <span className="num text-[11px] font-bold tracking-[0.14em] text-ink-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[16px] font-bold text-ink">{g.label}</h3>
              </div>
              <dl className="mt-3 space-y-1.5 text-[13px] leading-[1.7]">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-4">读</dt>
                  <dd className="text-ink-3">{g.reads}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-4">判</dt>
                  <dd className="text-ink-3">{g.decides}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-4">弃</dt>
                  <dd className={g.drops === "—" ? "text-ink-4" : "text-ink-3"}>{g.drops}</dd>
                </div>
              </dl>
            </div>
            {i < GATES.length - 1 && (
              <span aria-hidden className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-ink-4 lg:hidden">
                <IconArrowRight size={14} className="rotate-90" />
              </span>
            )}
          </li>
        ))}
      </ol>

      <p className="mt-5 text-[13px] leading-[1.85] text-ink-4">
        「预筛」只判断与公益是否相关，「打分」才判断重不重要——被拦下的内容可以在
        <Link to="/all" prefetch="intent" className="mx-1 text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
          全部动态
        </Link>
        里看到全文，只是不会占用首页的位置。
      </p>
    </figure>
  );
}

export default PipelineFlow;
