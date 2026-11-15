// 地址工具。两处用到：web 层判断前置代理是否可信，api 层判断一个请求是不是内部 SSR。
// 单独放 contracts，是因为这两个判断必须用同一套规则——否则「web 认为是公网、api 认为是内网」
// 这种错位会让限流悄悄失效，且不会报任何错。

/** 去掉 IPv6 zone（fe80::1%eth0）、方括号与 IPv4-mapped 前缀，统一成可比较的小写形式。 */
export function normalizeAddress(input: string): string {
  let ip = (input ?? "").trim().toLowerCase();
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  return ip;
}

/**
 * 本机、容器网段、链路本地与保留地址。用于回答一个问题：这个请求是不是从同一台机器 /
 * 同一个容器网络里发出来的。公网地址一律返回 false。
 */
export function isPrivateAddress(input: string): boolean {
  const ip = normalizeAddress(input);
  if (!ip) return false;
  if (ip === "::" || ip === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true; // fc00::/7 唯一本地
  if (/^fe[89ab][0-9a-f]:/.test(ip)) return true; // fe80::/10 链路本地
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true; // 组播与保留段
  return false;
}

/**
 * 从 X-Forwarded-For 里取「最后一跳」的地址。前置代理（Caddy / nginx）把真实地址追加在末尾，
 * 所以前面无论被写进什么都与我们无关，只有最后一项是它亲眼看到的那一跳。
 */
export function lastForwardedAddress(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header.join(",") : (header ?? "");
  const parts = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? normalizeAddress(last) : null;
}
