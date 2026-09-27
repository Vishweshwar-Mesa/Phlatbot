import "server-only";

// Reads a public listing page so the bot can extract from a link (free: a plain fetch, no scraping API).
// Best effort: many portals render with JavaScript or block bots. Then we say so and ask for the text.

export const URL_RE = /https?:\/\/[^\s<>"']+/i;

function blockedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.startsWith("[") || h === "metadata.google.internal"
  );
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8377;|&#x20b9;/gi, "₹");

export async function readListingPage(raw: string): Promise<{ ok: true; url: string; text: string } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(raw.replace(/[).,]+$/, ""));
  } catch {
    return { ok: false, reason: "That link doesn't look valid." };
  }
  if (!/^https?:$/.test(url.protocol) || blockedHost(url.hostname)) return { ok: false, reason: "I can only open public web links." };

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    });
    if (!res.ok) return { ok: false, reason: `The site refused the request (HTTP ${res.status}).` };
    if (!(res.headers.get("content-type") ?? "").includes("html")) return { ok: false, reason: "That link isn't a web page." };
    html = (await res.text()).slice(0, 2_000_000);
  } catch {
    return { ok: false, reason: "I couldn't reach that page." };
  }

  const parts: string[] = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) parts.push(title);
  for (const m of html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:title|og:description)["'][^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (c) parts.push(c);
  }
  // JSON-LD often carries price, address and amenities in structured form.
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    parts.push(m[1].slice(0, 3000));
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  parts.push(body);

  const text = decode(parts.join("\n")).replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 6000);
  if (text.length < 200) {
    return { ok: false, reason: "The page loaded but had almost no readable text (the site probably builds it with JavaScript)." };
  }
  return { ok: true, url: url.toString(), text };
}
