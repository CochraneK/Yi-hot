// Who counts as one participant, in SQL. Heat, the board's faces and a story's own counts must use
// the same identity, or the event page and the ranking disagree about how many outlets reported.
import { sql } from "../db.ts";

/**
 * A search source files each result under the site it came from, and that key can still carry a
 * reading surface: "site:www.gov.cn" beside "site:gov.cn", written before the host normaliser dropped
 * the prefixes. Read as two keys, one outlet holds two votes and shows up twice on the board.
 */
const SITE_PREFIX = "^site:((www|m|m2|wap|3g|4g|h5|mobile|big5)[.])+";

/** The participant key with reading-surface prefixes removed; `participant_key` must be in scope. */
export const participantIdentity = () => sql`regexp_replace(participant_key, ${SITE_PREFIX}, 'site:')`;

/**
 * What to call a site participant. A search result carries the outlet's own name ("光明网") in the
 * article's author; some only repeat the domain back ("qq.com"), and a stray sentence or a long
 * byline is not a site name either — those fall back to the host.
 */
const HOSTLIKE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;
export function outletName(author: string | null | undefined, host: string): string {
  const name = author?.trim().replace(/\s+/g, " ") ?? "";
  return name && name.length <= 24 && !HOSTLIKE.test(name) ? name : host;
}
