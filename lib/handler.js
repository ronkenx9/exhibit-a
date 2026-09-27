import { runCase } from "./pipeline.js";
import { getCase, SAMPLE_CASES } from "./cases.js";
import { RULES } from "./rules.js";
import { hasKey } from "./serv.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export async function handleCases() {
  return json({ cases: SAMPLE_CASES, rules: RULES, live: hasKey() });
}

function validateCase(c) {
  if (!c || typeof c !== "object") return "case missing";
  if (!Array.isArray(c.exhibits) || c.exhibits.length < 1 || c.exhibits.length > 12) return "1-12 exhibits required";
  if (c.exhibits.some((e) => typeof e.text !== "string" || e.text.length > 12000)) return "exhibit text missing or too long";
  if (!(Number(c.amount) > 0)) return "amount must be positive";
  return null;
}

// Per-instance limiter so a public demo can't drain the SERV balance.
const hits = new Map();
function limited(request) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 12) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function handleRun(request) {
  if (limited(request)) return json({ error: "Demo limit reached (12 runs/hour). Clone the repo to run your own." }, 429);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const c = body.caseId ? getCase(body.caseId) : body.case;
  const bad = validateCase(c);
  if (bad) return json({ error: bad }, 400);
  if (!hasKey()) return json({ error: "Server has no SERV_API_KEY configured" }, 503);
  c.exhibits = c.exhibits.map((e, i) => ({ id: e.id || `E${i + 1}`, title: e.title || `Exhibit ${i + 1}`, kind: e.kind || "other", text: e.text }));
  c.amount = Number(c.amount);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        for await (const ev of runCase(c)) send(ev);
      } catch (e) {
        send({ type: "error", message: e.message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
