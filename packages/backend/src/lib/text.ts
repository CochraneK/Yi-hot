// 只匹配模型任务自述和推理标记；普通 First、报道中的引语不构成拦截依据。
const NOT_COPY = /\*\*|绝不译成|最多\s*3\s*句|80-160\s*字|Analyze (?:the )?(?:User )?Request|(?:^|\n)\s*[-*•]?\s*Roles?\s*[:：]/i;
const REASONING_COPY = [
  /(?:^|[\s。！？.!?])\s*<\/?(?:think|thinking|analysis)\b[^>]*>/i,
  /(?:^|[\n。！？.!?])\s*first[,，:：]\s*(?:understand|analy[sz]e|examine)\s+(?:the\s+)?original\s+title\s*[:：]/i,
  /(?:^|[\n。！？.!?])\s*(?:(?:first|next|now)[,，:：]\s*)?(?:we|i)\s+(?:need to|must|should|will|have to|am going to)\s+(?:produce|generate|write|return|output|translate)\s+(?:(?:a|the|chinese)\s+)*(?:(?:title_zh|summary_zh|title|summary)\b|中文标题|中文摘要)/i,
  /(?:^|[\n。！？.!?])\s*(?:(?:first|next|now)[,，:：]\s*)?(?:let['’]s|let us)\s+(?:understand|analy[sz]e|examine)\s+(?:the\s+)?original\s+(?:title|request|article)\b/i,
  /(?:^|[\n。！？])\s*(?:首先[，,：:]?\s*)?(?:我(?:们)?(?:需要|必须|应该|将要)|接下来我(?:们)?(?:要|将))\s*(?:生成|输出|撰写|翻译|总结|分析|理解)\s*(?:中文标题|中文摘要|原文标题|原始标题|title_zh|summary_zh)/,
  /(?:^|[\n。！？])\s*(?:首先[，,：:]?\s*)?(?:分析|理解)(?:原始|原文)标题\s*[:：]/,
];

/** 纯内容检测供写作和发布共用，不改变旧入库文案的语言处理规则。 */
export function isNonCopy(text: string): boolean {
  return NOT_COPY.test(text) || REASONING_COPY.some((pattern) => pattern.test(text));
}

/** 空值让调用者沿用原文标题或省略摘要。 */
export function usableCopy(text: string, kind: "title" | "summary" | "body"): string {
  if (!text) return text;
  if (isNonCopy(text)) return "";
  if (kind !== "title" && text.length >= 40 && !/[一-鿿]/.test(text)) return "";
  return text;
}

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function truncate(s: string, max: number, ellipsis = "…"): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, Math.max(0, max - ellipsis.length)).join("").trimEnd() + ellipsis;
}

export function stripTags(html: string): string {
  return collapseWhitespace(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'"),
  );
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // XML 1.0 forbids most control characters.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Share of CJK characters among letters; used to decide whether a title needs translation. */
export function cjkRatio(s: string): number {
  const letters = s.match(/[\p{L}]/gu) ?? [];
  if (letters.length === 0) return 0;
  const cjk = s.match(/[㐀-鿿豈-﫿]/g) ?? [];
  return cjk.length / letters.length;
}

export function guessLanguage(s: string): "zh" | "en" | "other" {
  const ratio = cjkRatio(s);
  if (ratio > 0.3) return "zh";
  if (/[a-z]/i.test(s)) return "en";
  return "other";
}
