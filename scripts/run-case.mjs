import { runCase } from "../lib/pipeline.js";
import { getCase } from "../lib/cases.js";
const c = getCase(process.argv[2]);
const t0 = Date.now();
try {
  for await (const ev of runCase(c)) {
    if (ev.type === "step") console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] ${ev.status.padEnd(7)} ${ev.title} — ${ev.detail}`);
    else { console.log(JSON.stringify({facts: ev.facts.map(f=>[f.requirement,f.exhibit,f.ok,f.reason||"",f.quote]), adverse: ev.adverse, modelInj: ev.modelInjections, stripe: ev.stripeEvidence, audit: ev.audit}, null, 1)); if (ev.brief) console.log(ev.brief.raw); }
  }
} catch (e) { console.error("ERR", e.message, e.audit, (e.raw||"").slice(0,800)); }
