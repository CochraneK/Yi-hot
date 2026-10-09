import { Link } from "react-router";
import { IconArrowRight } from "../../components/icons";

/**
 * The prefilter pipeline as it actually runs, read off packages/backend/src/editorial/analyze.ts.
 *
 * Two things this diagram is careful to show, because they are the ones people get
 * wrong when they ask "why isn't my article here":
 *
 *  1. UNKNOWN is NOT a rejection. Only BLOCK stops the item (analyze.ts:342-343);
 *     UNKNOWN continues because its material is already as complete as it will get.
 *  2. A low score short-circuits before the expensive writing step: understand only
 *     runs when the score is near its threshold, otherwise summarize is used
 *     (analyze.ts:353-355). That is a cost decision, not an editorial one.
 */

/** What the prefilter prompt can answer, and where each answer goes. */
const VERDICTS = [
  {
    label: "PASS",
    tone: "pass",
    meaning: "确认与公益相关",
    next: "继续打分",
  },
  {
    label: "UNKNOWN",
    tone: "unknown",
    meaning: "材料不足，无法判定",
    next: "照样放行，等待补材料",
  },
  {
    label: "BLOCK",
    tone: "block",
    meaning: "确认与公益无关",
    next: "就地停止，不再消耗模型调用",
  },
] as const;

const TONE: Record<string, { chip: string; edge: string; bar: string }> = {
  pass: { chip: "border-accent text-accent", edge: "border-accent/45", bar: "bg-accent" },
  unknown: { chip: "border-ink-4/50 text-ink-3", edge: "border-ink-4/40", bar: "bg-ink-4/50" },
  block: { chip: "border-ink-4/40 text-ink-4", edge: "border-ink-4/25", bar: "bg-ink-4/30" },
};

export function PipelineFlow({ className = "" }: { className?: string }) {
  return (
    <figure id="pipeline" className={`mt-10 scroll-mt-24 xl:mt-14 ${className}`}>
      <figcaption className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-8">
        <span className="text-[12px] font-semibold tracking-[0.2em] text-accent">筛选流水线</span>
        <span className="text-[14px] font-bold text-ink">一条动态进来之后，会遇到什么</span>
        <span className="text-[13px] text-ink-4">按 prefilter 的真实判定分支，不是概念示意。</span>
      </figcaption>

      {/* 1. collect */}
      <div className="rounded-xl border border-line-strong bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-[11px] font-bold tracking-[0.14em] text-ink-4">01</span>
          <h3 className="text-[16px] font-bold text-ink">采集</h3>
          <span className="text-[13px] text-ink-3">按栏目抓列表页，拿到标题、链接、发布时间</span>
        </div>
      </div>

      {/* connector */}
      <div aria-hidden className="flex justify-center py-1.5">
        <IconArrowRight size={15} className="rotate-90 text-ink-4" />
      </div>

      {/* 2. dedupe */}
      <div className="rounded-xl border border-line-strong bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-[11px] font-bold tracking-[0.14em] text-ink-4">02</span>
          <h3 className="text-[16px] font-bold text-ink">去重</h3>
          <span className="text-[13px] text-ink-3">
            以 <code className="text-ink-2">url:</code> 前缀做唯一键，同一链接只留一条
          </span>
        </div>
      </div>

      <div aria-hidden className="flex justify-center py-1.5">
        <IconArrowRight size={15} className="rotate-90 text-ink-4" />
      </div>

      {/* 3. prefilter with three outcomes */}
      <div className="rounded-xl border-2 border-accent/50 bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-[11px] font-bold tracking-[0.14em] text-accent">03</span>
          <h3 className="text-[16px] font-bold text-ink">相关性预筛</h3>
          <span className="text-[13px] text-ink-3">只回答一个问题：跟公益有没有关系</span>
        </div>

        <ul className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {VERDICTS.map((v) => {
            const t = TONE[v.tone]!;
            return (
              <li key={v.label} className={`rounded-lg border bg-surface px-3.5 py-3 ${t.edge}`}>
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-[0.1em] ${t.chip}`}>
                  {v.label}
                </span>
                <p className="mt-2 text-[13px] leading-[1.6] text-ink-3">{v.meaning}</p>
                <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-[1.6] text-ink-4">
                  <span aria-hidden className={`mt-[7px] h-px w-3 shrink-0 ${t.bar}`} />
                  {v.next}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="mt-3.5 text-[12.5px] leading-[1.75] text-ink-4">
          只有 <span className="font-semibold text-ink-3">BLOCK</span>{" "}
          会让流程停下。UNKNOWN 放行——因为它手上的材料已经是最全的了，再等也不会多出信息。
        </p>
      </div>

      {/* continue line */}
      <div aria-hidden className="flex items-center gap-3 py-3 pl-5">
        <span className="h-8 w-px bg-line-strong" />
        <span className="text-[12px] text-ink-4">PASS 与 UNKNOWN 继续</span>
      </div>

      {/* 4. score with the short-circuit note */}
      <div className="rounded-xl border border-accent/40 bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-[11px] font-bold tracking-[0.14em] text-accent">04</span>
          <h3 className="text-[16px] font-bold text-ink">两次独立打分</h3>
          <span className="text-[13px] text-ink-3">各打一次分再相加，防止单次判断决定命运</span>
        </div>
        <p className="mt-2.5 text-[13px] leading-[1.75] text-ink-3">
          门槛按信源等级定：<span className="text-ink-2">T1 / T1_5 = 35，T2 = 40</span>。
          两项之和 ≥ 2 倍门槛才算入选。
        </p>
      </div>

      {/* branch: near threshold vs not */}
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-lg border border-accent/40 bg-surface px-4 py-3.5">
          <p className="text-[13px] font-semibold text-ink">分数够得着门槛</p>
          <p className="mt-1.5 text-[12.5px] leading-[1.7] text-ink-3">
            走深度理解，生成中文标题、摘要与推荐理由——这一步最贵，所以只在接近门槛时才做。
          </p>
        </div>
        <div className="rounded-lg border border-line-strong bg-surface px-4 py-3.5">
          <p className="text-[13px] font-semibold text-ink">分数明显偏低</p>
          <p className="mt-1.5 text-[12.5px] leading-[1.7] text-ink-3">
            跳过深度理解，只做摘要。省下一次模型调用，内容仍然会进「全部动态」。
          </p>
        </div>
      </div>

      <div aria-hidden className="flex justify-center py-1.5">
        <IconArrowRight size={15} className="rotate-90 text-ink-4" />
      </div>

      {/* 5. select */}
      <div className="rounded-xl border-2 border-accent bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-[11px] font-bold tracking-[0.14em] text-accent">05</span>
          <h3 className="text-[16px] font-bold text-ink">精选与发布</h3>
          <span className="text-[13px] text-ink-3">分数够、标题和摘要都在，才进首页</span>
        </div>
        <p className="mt-2.5 text-[13px] leading-[1.75] text-ink-3">
          过了这一关才有精选资格。缺中文标题或摘要的会再等一轮，不会带残缺内容上架。
        </p>
      </div>

      <p className="mt-6 border-t border-line pt-5 text-[13px] leading-[1.85] text-ink-4">
        没进首页不等于没抓到：绝大多数内容停在第 4 步，它们在
        <Link
          to="/all"
          prefetch="intent"
          className="mx-1 text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          全部动态
        </Link>
        里都能读到全文。想知道某条具体内容卡在哪一步，看它的详情页。
      </p>
    </figure>
  );
}

export default PipelineFlow;