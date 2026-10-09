import { Link } from "react-router";
import { IconArrowRight } from "../../components/icons";

/**
 * The prefilter pipeline as a single diagram image, drawn off
 * packages/backend/src/editorial/analyze.ts (lines 342-355) rather than a conceptual
 * sketch: UNKNOWN is let through, only BLOCK stops the item, and the expensive
 * understand step only runs when the score is near its threshold.
 *
 * The artwork lives at public/pipeline-prefilter.png (generated from
 * assets/pipeline-prefilter.svg) so the page stays a plain <img> and the image
 * itself can be reused elsewhere (docs, slides, agent-facing pages).
 */
export function PipelineFlow({ className = "" }: { className?: string }) {
  return (
    <figure id="pipeline" className={`mt-10 scroll-mt-24 xl:mt-14 ${className}`}>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <img
          src="/yihot/pipeline-prefilter.png"
          width={1600}
          height={1000}
          loading="lazy"
          decoding="async"
          alt="筛选流水线：采集、去重、相关性预筛（PASS 继续、UNKNOWN 放行、BLOCK 停止）、两次独立打分、按分数决定是否走深度理解"
          className="block w-full"
        />
      </div>

      <figcaption className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[12px] font-semibold tracking-[0.2em] text-accent">筛选流水线</span>
        <span className="text-[13px] text-ink-3">
          没进首页不等于没抓到：绝大多数内容停在打分那一步，在
        </span>
        <Link
          to="/all"
          prefetch="intent"
          className="text-[13px] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          全部动态
        </Link>
        <span className="text-[13px] text-ink-3">里都能读到全文。</span>
      </figcaption>

      <p className="mt-6 border-t border-line pt-5 text-[13px] leading-[1.85] text-ink-4">
        如果你想知道某一条具体内容卡在哪一步，打开它的详情页就能看到每一步的判定与依据；
        被预筛拦下的内容不进详情页，但会保留在
        <Link
          to="/all"
          prefetch="intent"
          className="mx-1 text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          全部动态
        </Link>
        里。
      </p>
    </figure>
  );
}

export default PipelineFlow;