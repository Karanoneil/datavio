import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Server-only fetch for user-supplied URLs (store catalogs). Blocks requests to private,
 * loopback, link-local and cloud-metadata addresses so the endpoint can't be used to probe
 * the server's internal network (SSRF). Redirects are followed manually and re-checked.
 *
 * Known limit: a DNS answer can change between our lookup and fetch's own lookup (DNS
 * rebinding). Deploy behind an egress firewall if that matters for your threat model.
 */

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipPrivate(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Private(ip);
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

export async function assertPublicHttps(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only https:// URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");
  await assertPublicHost(url.hostname);
  return url;
}

/** Throws unless every address the host resolves to is public. Used for catalog URLs and user-supplied SMTP hosts. */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private hosts are not allowed.");
  let addrs: { address: string }[];
  try {
    addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  } catch {
    throw new Error(`Couldn't resolve ${host}.`);
  }
  if (!addrs.length || addrs.some((a) => ipPrivate(a.address))) throw new Error("That host resolves to a private address.");
}

export async function safeFetch(raw: string, opts: { maxBytes: number; accept?: string; timeoutMs?: number }): Promise<{ url: URL; body: string; contentType: string }> {
  let url = await assertPublicHttps(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { Accept: opts.accept ?? "*/*", "User-Agent": "DatavioMail/1.0 (+catalog import)" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect without a location (${res.status}).`);
      url = await assertPublicHttps(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`The store responded with ${res.status}.`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > opts.maxBytes) throw new Error("The catalog is too large to import this way.");
    const reader = res.body?.getReader();
    if (!reader) return { url, body: "", contentType: res.headers.get("content-type") ?? "" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        await reader.cancel();
        throw new Error("The catalog is too large to import this way.");
      }
      chunks.push(value);
    }
    return { url, body: Buffer.concat(chunks).toString("utf8"), contentType: res.headers.get("content-type") ?? "" };
  }
  throw new Error("Too many redirects.");
}
