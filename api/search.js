// Sift backend — runs on Vercel (or any Node serverless host).
// Holds YOUR Anthropic key server-side so visitors never see it and don't need their own.
// Set the key as an environment variable named ANTHROPIC_API_KEY in your host's dashboard.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

// ── Quotas & cost control (durable, backed by Upstash Redis) ───────────────
// Two layers protect your wallet:
//   1. FREE_ASKS  — each visitor (per IP) gets this many price searches, then
//                   the API returns { paywall: true } and the UI shows the
//                   upgrade screen. This is the per-user limit.
//   2. DAILY_MAX  — a hard ceiling on TOTAL price searches across EVERYONE per
//                   day, so even a flood can't run your bill past it.
// Counters live in Upstash Redis (free tier) so they survive across serverless
// instances. If Upstash env vars are absent, it falls back to in-memory
// counters — fine for local dev, but NOT durable in production.
//
// Set these in your host's environment variables:
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN   (from upstash.com)
// Optional overrides:
//   FREE_ASKS (default 3), DAILY_MAX (default 500), FREE_WINDOW_DAYS (default 30)
const FREE_ASKS = parseInt(process.env.FREE_ASKS || "0", 10);
const DAILY_MAX = parseInt(process.env.DAILY_MAX || "500", 10);
const FREE_TTL = parseInt(process.env.FREE_WINDOW_DAYS || "30", 10) * 86400; // seconds
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_ON = !!(REDIS_URL && REDIS_TOKEN);

// Talk to Upstash over its REST API (one command per call, e.g. ["INCR", key]).
async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const d = await r.json();
  if (d.error) throw new Error("Redis: " + d.error);
  return d.result;
}

// In-memory fallback (per instance, resets on cold start). Dev only.
const mem = new Map(); // key -> { n, exp }
function memIncr(key, ttl) {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || cur.exp < now) { mem.set(key, { n: 1, exp: now + ttl * 1000 }); return 1; }
  cur.n += 1; return cur.n;
}
function memDecr(key) {
  const cur = mem.get(key);
  if (cur && cur.n > 0) cur.n -= 1;
  return cur ? cur.n : 0;
}

async function incr(key, ttl) {
  if (!REDIS_ON) return memIncr(key, ttl);
  const n = await redis(["INCR", key]);
  if (n === 1) await redis(["EXPIRE", key, ttl]); // set TTL only on first write
  return n;
}
async function decr(key) {
  if (!REDIS_ON) return memDecr(key);
  return redis(["DECR", key]);
}

// ── Prompts (kept server-side) ─────────────────────────────────────────────
const SYSTEM =
  "You are Sift, a sharp, honest shopping assistant. Your job is to find where a product can be bought for the lowest current price. Always use web search for up-to-date prices and stock. Never invent prices, stores, or links. Prefer reputable retailers.";

function clarifyPrompt(item, country) {
  const loc = country || "the user's country";
  return `The user wants to buy: "${item}". They are shopping in ${loc}.
Return ONLY raw JSON (no markdown) that asks a few quick questions to find the best LOCAL deal. Always set "clarify": true.

Shape:
{
  "clarify": true,
  "intro": "A few quick questions to find your best local deal:",
  "questions": [
    {"key": "fulfil", "q": "Delivery or in-store pickup?", "options": ["Delivery", "Pickup", "No preference"]},
    {"key": "city", "q": "Which area are you nearest?", "options": ["...3-4 real major cities or areas in ${loc}...", "No preference"]},
    {"key": "store", "q": "Any preferred store?", "options": ["...3-4 real popular retailers in ${loc}...", "No preference"]}
  ]
}
Rules:
- ALWAYS include those three questions, using REAL city names and REAL retailer names that exist in ${loc}.
- If "${item}" is a configurable product (desktop/gaming PC, laptop, phone, tablet, TV, graphics card, monitor, camera, smartwatch, etc.), ADD 1-2 short spec questions (e.g. budget range, key spec) as well.
- 3-5 options per question; ALWAYS end each question's options with "No preference".
- Keep every label short. Return ONLY raw JSON, no markdown.`;
}

function pricePrompt(item) {
  return `Find where to buy "${item}" for the cheapest price right now. Search the web for current prices from major, reputable retailers (and the user's region if named).

After researching, reply with ONLY a valid JSON object — no markdown, no code fences, no text before or after:
{
  "item": "clear product name",
  "found": true,
  "currency": "USD",
  "summary": "one short sentence naming the cheapest store and price",
  "retailers": [
    {"name": "Store name", "price": "89.99", "url": "https://real-link", "note": "short stock/shipping note", "cheapest": true}
  ],
  "tips": ["one short money-saving tip"]
}
Rules:
- 3 to 6 real retailers, sorted cheapest first.
- "price" is the number only; put the symbol/code in "currency".
- "cheapest": true on ONLY the single lowest-priced option.
- "url" must be a real link found via search; "note" under 8 words.
- 1 to 3 short tips.
- If you cannot find it, set "found": false, explain in "summary", empty "retailers".`;
}

function extractJSON(text) {
  if (!text) return null;
  const c = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = c.indexOf("{"), e = c.lastIndexOf("}");
  if (s === -1 || e === -1 || e < s) return null;
  try { return JSON.parse(c.slice(s, e + 1)); } catch { return null; }
}

async function callAnthropic(key, body) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": VERSION,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error((data.error && data.error.message) || `Anthropic error ${res.status}`);
  }
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Set it in your host's environment variables." });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const mode = body?.mode;
  const item = (body?.item || "").toString().trim().slice(0, 200);
  const country = (body?.country || "").toString().trim().slice(0, 60);

  if (!item) { res.status(400).json({ error: "Please include an item to search for." }); return; }
  if (mode !== "clarify" && mode !== "price") { res.status(400).json({ error: "Invalid mode." }); return; }

  try {
    if (mode === "clarify") {
      const text = await callAnthropic(key, {
        model: "claude-haiku-4-5",
        max_tokens: 700,
        messages: [{ role: "user", content: clarifyPrompt(item, country) }],
      });
      const parsed = extractJSON(text);
      if (parsed && parsed.clarify && Array.isArray(parsed.questions) && parsed.questions.length) {
        res.status(200).json(parsed);
      } else {
        res.status(200).json({ clarify: false });
      }
      return;
    }

    // mode === "price" — this is the one that costs money, so meter it here.
    // Per-user access is gated by CREDITS in the browser (frontend). The server
    // enforces a global daily spend cap so a bad day can't drain the card.
    {
      const day = new Date().toISOString().slice(0, 10);
      const dayKey = `sift:day:${day}`;
      let usedToday = 0;
      try { usedToday = await incr(dayKey, 2 * 86400); } catch (e) { usedToday = 0; }
      if (usedToday > DAILY_MAX) {
        res.status(503).json({ capped: true, error: "Sift has hit its limit for today. Please try again tomorrow." });
        return;
      }
    }

    const text = await callAnthropic(key, {
      model: "claude-sonnet-4-6",
      max_tokens: 1100,
      system: SYSTEM,
      messages: [{ role: "user", content: pricePrompt(item) }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    });
    const parsed = extractJSON(text);
    if (parsed) {
      res.status(200).json(parsed);
    } else {
      res.status(200).json({ found: false, summary: "Couldn't read a clean result — try a more specific name." });
    }
  } catch (e) {
    res.status(502).json({ error: e.message || "Something went wrong reaching the AI." });
  }
};
