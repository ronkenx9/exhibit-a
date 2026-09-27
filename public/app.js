const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const state = {
  cases: [],
  rules: {},
  live: false,
  current: null,
  results: store.get("xa.results", {}),
  running: false,
  steps: [],
  tab: "exhibits",
};

const PREVENT = {
  "10.4": [
    "Capture device ID and login for every order so Visa CE 3.0 can match future disputes against prior undisputed purchases.",
    "Step up to 3-D Secure when AVS fails — liability shifts to the issuer.",
    "Hold guest orders that ship away from the billing address for manual review.",
  ],
  "13.1": ["Require signature or photo proof of delivery above your median order value."],
  "13.2": ["Send a renewal reminder 7 days before billing and log opens."],
  "13.3": ["Snapshot the product listing at checkout time and attach it to the order."],
  "4853": ["Require signature or photo proof of delivery above your median order value."],
};

// ---------- boot ----------

async function boot() {
  const r = await fetch("/api/cases").then((r) => r.json());
  state.rules = r.rules;
  state.live = r.live;
  state.cases = [...r.cases, ...store.get("xa.custom", [])];
  const pill = $("#live");
  pill.classList.add(r.live ? "on" : "off");
  $("span", pill).textContent = r.live ? "SERV Reasoning · live" : "SERV key missing";
  renderInbox();
  select(state.cases[0].id);
  bindUi();
}

function ruleOf(c) { return state.rules[`${c.network}:${c.code}`]; }
function daysLeft(c) {
  const rule = ruleOf(c);
  const due = new Date(c.opened); due.setDate(due.getDate() + (rule?.deadlineDays || 30));
  return Math.max(0, Math.ceil((due - new Date()) / 864e5));
}

// ---------- inbox ----------

function renderInbox() {
  $("#caseList").innerHTML = state.cases.map((c) => {
    const res = state.results[c.id];
    const badge = res ? `<span class="badge ${res.verdict.decision.toLowerCase()}">${res.verdict.decision}</span>` : `<span class="badge">${daysLeft(c)}d left</span>`;
    return `<li class="case-item ${state.current?.id === c.id ? "on" : ""}" data-id="${esc(c.id)}">
      <div class="row"><span class="m">${esc(c.merchant)}</span><span class="amt">${money(c.amount)}</span></div>
      <div class="row sub"><span>${esc(ruleOf(c)?.network || c.network)} ${esc(c.code)} · ${esc(ruleOf(c)?.label.split(/[—/]/)[0].trim() || "")}</span>${badge}</div>
    </li>`;
  }).join("");
}

function select(id) {
  if (state.running) return;
  state.current = state.cases.find((c) => c.id === id);
  state.steps = [];
  renderInbox();
  renderHead();
  const res = state.results[id];
  renderExhibits(res);
  renderRun(res);
  renderBrief(res);
  renderPacket(res);
  setTab("exhibits");
}

function renderHead() {
  const c = state.current, rule = ruleOf(c);
  $("#fileHead").innerHTML = `
    <div class="meta"><span class="badge">${esc(c.id)}</span><span>${esc(rule.network)} ${esc(rule.code)} · ${esc(rule.label)}</span><span>· opened ${esc(c.opened)}</span><span>· respond within ${daysLeft(c)} days</span></div>
    <h1>${esc(c.merchant)} <span class="amount">${money(c.amount)}</span></h1>
    <p class="claim"><b>Cardholder</b>${esc(c.cardholder)} — “${esc(c.summary)}”</p>`;
}

// ---------- exhibits with highlights ----------

function findQuote(text, quote) {
  const words = String(quote).replace(/[\u2018\u2019\u201c\u201d"'`]/g, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const pat = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(`["'\u2018\u2019\u201c\u201d]?\\s+["'\u2018\u2019\u201c\u201d]?`);
  const m = new RegExp(pat, "i").exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

function highlighted(ex, res, upto = Infinity) {
  const ranges = [];
  if (res) {
    for (const inj of res.injections || []) if (inj.exhibit === ex.id) ranges.push({ s: inj.start, e: inj.end, kind: "inj" });
    let i = 0;
    for (const f of res.facts || []) {
      if (!f.ok || f.exhibit !== ex.id) continue;
      if (i++ >= upto) break;
      const r = findQuote(ex.text, f.quote);
      if (r) ranges.push({ s: r[0], e: r[1], kind: "q", title: `${f.requirement}: ${f.statement}` });
    }
    for (const a of res.adverse || []) {
      if (a.exhibit !== ex.id) continue;
      const r = findQuote(ex.text, a.quote);
      if (r) ranges.push({ s: r[0], e: r[1], kind: "q adverse", title: `Adverse: ${a.note}` });
    }
  }
  ranges.sort((a, b) => a.s - b.s || b.e - a.e);
  let out = "", pos = 0;
  for (const r of ranges) {
    if (r.s < pos) continue;
    out += esc(ex.text.slice(pos, r.s));
    const inner = esc(ex.text.slice(r.s, r.e));
    out += r.kind === "inj"
      ? `<span class="inj-label">QUARANTINED</span><mark class="inj">${inner}</mark>`
      : `<mark class="${r.kind}" title="${esc(r.title)}">${inner}</mark>`;
    pos = r.e;
  }
  return out + esc(ex.text.slice(pos));
}

function renderExhibits(res) {
  const c = state.current;
  $("#tab-exhibits").innerHTML = c.exhibits.map((ex) => `
    <article class="ex" id="ex-${esc(ex.id)}">
      <div class="ex-head"><span class="ex-id">${esc(ex.id)}</span><span class="ex-title">${esc(ex.title)}</span><span class="ex-kind">${esc(ex.kind)}</span></div>
      <pre>${highlighted(ex, res)}</pre>
    </article>`).join("");
}

function flashExhibit(id) {
  setTab("exhibits");
  const el = $(`#ex-${CSS.escape(id)}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1600);
}

// ---------- run column ----------

function renderSteps() {
  $("#steps").innerHTML = state.steps.map((s) => `
    <li class="step ${s.status}"><span class="dot"></span><div><div class="t">${esc(s.title)}</div><div class="d">${esc(s.detail || "")}</div></div></li>`).join("");
}

function renderRun(res) {
  const btn = $("#runBtn");
  btn.disabled = state.running || !state.live;
  btn.textContent = state.running ? "Building…" : res ? "Rebuild the case" : "Build the case";
  if (!state.running && res && !state.steps.length) state.steps = res.steps || [];
  renderSteps();
  $("#verdict").innerHTML = res ? verdictHtml(res) : "";
  $("#reqs").innerHTML = res ? reqsHtml(res) : "";
  $("#audit").innerHTML = res ? auditHtml(res) : "";
  requestAnimationFrame(() => document.querySelectorAll(".meter i[data-w]").forEach((i) => (i.style.width = i.dataset.w + "%")));
}

function verdictHtml(res) {
  const v = res.verdict, fight = v.decision === "FIGHT";
  return `<div class="verdict">
    <span class="v-stamp ${fight ? "fight" : "accept"}">${v.decision}</span>
    <div class="v-grid">
      <div><div class="k">Win likelihood</div><div class="v">${v.likelihood}%</div><div class="meter"><i style="width:0" data-w="${v.likelihood}"></i></div></div>
      <div><div class="k">Evidence coverage</div><div class="v">${v.coverage}/100</div><div class="meter"><i style="width:0" data-w="${v.coverage}"></i></div></div>
      <div><div class="k">Expected net</div><div class="v">${money(v.expectedNet)}</div></div>
      <div><div class="k">Our fee if won</div><div class="v">${money(v.fee)}</div></div>
    </div>
    <div class="v-note">${fight
      ? `Every required element is backed by a verified quote. Expected recovery ${money(v.expectedRecovery)} after the ${money(v.networkFee)} network fee.`
      : `Missing required evidence: ${v.missingRequired.map((k) => ruleOf(state.current).requirements.find((r) => r.key === k)?.label).join("; ")}. Fighting costs ${money(v.networkFee)} and would likely lose.`}</div>
  </div>`;
}

function reqsHtml(res) {
  return `<div class="sec-h">${esc(res.rule.network)} ${esc(res.rule.code)} requirements</div>` + res.requirements.map((r) => `
    <div class="req ${r.met ? "met" : "miss"}"><span class="ck">${r.met ? "✓" : "✕"}</span>
      <div>${esc(r.label)}${r.required ? `<span class="rq">REQUIRED</span>` : ""}
      ${r.met ? `<div class="src">${[...new Set(r.facts.map((f) => f.exhibit))].join(" · ")} — “${esc(r.facts[0].quote.slice(0, 70))}${r.facts[0].quote.length > 70 ? "…" : ""}”</div>` : ""}</div></div>`).join("");
}

function auditHtml(res) {
  const rows = res.audit.map((a) => `<tr><td>${esc(a.step)}</td><td>${esc(a.model)}<div class="feat">${esc(a.features.join(" · "))}</div></td><td>${a.promptTokens ?? "–"}/${a.completionTokens ?? "–"}</td><td>${(a.ms / 1000).toFixed(1)}s</td><td>${a.estCostUsd != null ? "$" + a.estCostUsd.toFixed(4) : "–"}</td></tr>`).join("");
  return `<div class="sec-h">SERV audit trail</div>
    <table class="audit"><tr><th>step</th><th>model · SERV features</th><th>tok in/out</th><th>time</th><th>cost</th></tr>${rows}
    <tr><td></td><td><b>total</b></td><td></td><td></td><td><b>$${res.totalCost.toFixed(4)}</b></td></tr></table>`;
}

// ---------- brief ----------

function renderBrief(res) {
  const tabBtn = $('[data-tab="brief"]');
  tabBtn.disabled = !res;
  tabBtn.textContent = res?.verdict.decision === "ACCEPT" ? "Accept memo" : "Rebuttal";
  const el = $("#tab-brief");
  if (!res) { el.innerHTML = ""; return; }
  const c = state.current;
  if (!res.brief) {
    const tips = PREVENT[c.code] || [];
    el.innerHTML = `<div class="memo">
      <h2>Don't fight this one.</h2>
      <p>The ${esc(res.rule.network)} ${esc(res.rule.code)} rules require evidence this file doesn't contain: <b>${res.requirements.filter((r) => r.required && !r.met).map((r) => esc(r.label)).join("; ")}</b>. An issuer rejects incomplete compelling evidence, so contesting spends ${money(res.verdict.networkFee)} to recover ${money(0)} in expectation.</p>
      <p>EXHIBIT A charges nothing for this advice. Accept the dispute and close the loop with the cardholder.</p>
      ${tips.length ? `<h4 style="font:600 11px var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin-top:18px">Stop the next one</h4><ul>${tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    </div>`;
    return;
  }
  const flagged = res.brief.lint.flatMap((b) => (b.kind === "para" ? b.sentences.filter((s) => s.issue) : [])).length;
  let body = "", title = "";
  for (const b of res.brief.lint) {
    if (b.kind === "heading") {
      if (!title && /rebuttal/i.test(b.text)) { title = b.text; continue; }
      body += `<h4>${esc(b.text)}</h4>`;
      continue;
    }
    body += `<p>${b.sentences.map((s) => {
      const text = esc(s.text.replace(/\s*\[E\d+\]/g, "")).trim();
      const cites = [...new Set(s.cites)].map((id) => `<span class="cite" data-ex="${id}">${id}</span>`).join("");
      return s.issue ? `<span class="struck">${text}</span><span class="struck-why">STRUCK · ${esc(s.issue)}</span>` : `${text}${cites}`;
    }).join(" ")}</p>`;
  }
  el.innerHTML = `
    <div class="doc-actions">
      <button class="small" id="printBtn">Download packet (PDF)</button>
      <button class="small" id="copyBrief">Copy rebuttal text</button>
      ${flagged ? `<span class="badge accept">${flagged} sentence${flagged > 1 ? "s" : ""} struck by citation lint</span>` : `<span class="badge fight">every sentence cites verified evidence</span>`}
    </div>
    <div class="doc">
      <div class="doc-top">
        <div><h2>${esc(title || "Rebuttal")}</h2><div class="from">Re: dispute ${esc(c.id)} · ${money(c.amount)} · cardholder ${esc(c.cardholder)}</div></div>
        <div class="from" style="text-align:right">${esc(c.merchant)}<br>${new Date(res.finishedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>
      </div>
      ${body}
      <div class="doc-foot">Exhibits: ${c.exhibits.map((e) => `${esc(e.id)} ${esc(e.title)}`).join(" · ")}<br>Prepared with EXHIBIT A on SERV Reasoning. Every statement is tied to a verbatim quote from the cited exhibit.</div>
    </div>`;
  $("#printBtn").onclick = () => { setTab("brief"); window.print(); };
  $("#copyBrief").onclick = (e) => copy(res.stripeEvidence.uncategorized_text, e.target);
}

function renderPacket(res) {
  const tabBtn = $('[data-tab="packet"]');
  tabBtn.disabled = !res?.brief;
  const el = $("#tab-packet");
  if (!res?.brief) { el.innerHTML = ""; return; }
  const json = JSON.stringify({ evidence: res.stripeEvidence }, null, 2);
  const pretty = esc(json).replace(/(&quot;[a-z_]+&quot;):/g, '<span class="k">$1</span>:').replace(/: (&quot;.*?&quot;)(,?)$/gm, ': <span class="s">$1</span>$2');
  el.innerHTML = `
    <p style="max-width:760px;color:var(--ink-2)">Maps straight onto Stripe's <code>POST /v1/disputes/${esc(state.current.id)}</code> evidence fields. Field values were copied verbatim from exhibits and verified by code.</p>
    <div class="doc-actions"><button class="small" id="copyJson">Copy JSON</button></div>
    <pre class="json">${pretty}</pre>`;
  $("#copyJson").onclick = (e) => copy(json, e.target);
}

async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = t), 1200); } catch {}
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  for (const t of ["exhibits", "brief", "packet"]) $(`#tab-${t}`).classList.toggle("hidden", t !== tab);
}

// ---------- run ----------

async function run() {
  const c = state.current;
  state.running = true;
  state.steps = [];
  delete state.results[c.id];
  renderRun(null); renderBrief(null); renderPacket(null); renderExhibits(null); setTab("exhibits");
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.remove("ready"));
  const partial = { injections: [], facts: [], adverse: [] };
  let result = null, error = null;
  try {
    const custom = !c.id.startsWith("dp_1Q");
    const resp = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(custom ? { case: c } : { caseId: c.id }) });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "step") {
          const i = state.steps.findIndex((s) => s.id === ev.id);
          const s = { id: ev.id, status: ev.status, title: ev.title, detail: ev.detail };
          if (i >= 0) state.steps[i] = s; else state.steps.push(s);
          renderSteps();
          if (ev.id === "screen") { partial.injections = ev.data.injections; renderExhibits(partial); }
          if (ev.id === "verify") { partial.facts = ev.data.facts; partial.adverse = ev.data.adverse; await revealFacts(partial); }
          if (ev.id === "verdict") $("#verdict").innerHTML = verdictHtml({ verdict: ev.data.verdict });
        } else if (ev.type === "result") {
          result = ev;
        } else if (ev.type === "error") {
          error = ev.message;
        }
      }
    }
  } catch (e) {
    error = e.message;
  }
  state.running = false;
  if (result) {
    result.steps = state.steps;
    state.results[c.id] = result;
    store.set("xa.results", state.results);
    renderInbox(); renderExhibits(result); renderRun(result); renderBrief(result); renderPacket(result);
    $('[data-tab="brief"]').classList.add("ready");
    if (result.brief) $('[data-tab="packet"]').classList.add("ready");
  } else {
    renderRun(null);
    $("#verdict").innerHTML = `<div class="err-box">${esc(error || "Run failed")}</div>`;
  }
}

// Light up verified quotes one at a time so the viewer sees each fact land.
async function revealFacts(partial) {
  const ok = partial.facts.filter((f) => f.ok).length;
  for (let i = 1; i <= ok; i++) {
    const res = { ...partial, adverse: [] };
    state.current.exhibits.forEach((ex) => {
      const el = $(`#ex-${CSS.escape(ex.id)} pre`);
      if (el) el.innerHTML = highlighted(ex, res, countFor(partial.facts, ex.id, i));
    });
    await new Promise((r) => setTimeout(r, 180));
  }
  renderExhibits(partial);
}
function countFor(facts, exId, i) {
  return facts.filter((f) => f.ok).slice(0, i).filter((f) => f.exhibit === exId).length;
}

// ---------- ui ----------

function bindUi() {
  $("#caseList").addEventListener("click", (e) => { const li = e.target.closest(".case-item"); if (li) select(li.dataset.id); });
  $("#runBtn").onclick = run;
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !b.disabled) { b.classList.remove("ready"); setTab(b.dataset.tab); } });
  $("#howBtn").onclick = () => $("#howDlg").showModal();

  const tip = $("#tip");
  document.addEventListener("mouseover", (e) => {
    const cite = e.target.closest(".cite");
    if (!cite) return;
    const res = state.results[state.current.id];
    const ex = state.current.exhibits.find((x) => x.id === cite.dataset.ex);
    const quotes = (res?.facts || []).filter((f) => f.ok && f.exhibit === cite.dataset.ex).map((f) => `<b>“${esc(f.quote)}”</b>`);
    tip.innerHTML = `${esc(ex?.id)} · ${esc(ex?.title)}<br>${quotes.slice(0, 3).join("<br>") || "—"}<br><span style="opacity:.6">click to open exhibit</span>`;
    const r = cite.getBoundingClientRect();
    tip.style.left = Math.min(r.left, innerWidth - 360) + "px";
    tip.style.top = r.bottom + 8 + "px";
    tip.classList.remove("hidden");
  });
  document.addEventListener("mouseout", (e) => { if (e.target.closest(".cite")) tip.classList.add("hidden"); });
  document.addEventListener("click", (e) => { const cite = e.target.closest(".cite"); if (cite) { tip.classList.add("hidden"); flashExhibit(cite.dataset.ex); } });

  // new case
  const sel = $("#ruleSel");
  sel.innerHTML = Object.entries(state.rules).map(([k, r]) => `<option value="${k}">${r.network} ${r.code} — ${r.label}</option>`).join("");
  $("#newBtn").onclick = () => { $("#newForm").reset(); $("#exFields").innerHTML = ""; addExField(); addExField(); $("#newDlg").showModal(); };
  $("#addEx").onclick = () => addExField();
  $("#importBtn").onclick = importStripe;
  $("#newDlg").addEventListener("close", () => { if ($("#newDlg").returnValue === "create") createCase(); });
}

function addExField(title = "", text = "") {
  const n = $("#exFields").children.length + 1;
  const div = document.createElement("div");
  div.className = "ex-field";
  div.innerHTML = `<label>Exhibit E${n} title<input class="ex-t" value="${esc(title)}" placeholder="e.g. Carrier tracking"></label><label>Contents<textarea class="ex-x" rows="4" placeholder="Paste the order record, tracking page, email thread, logs…">${esc(text)}</textarea></label>`;
  $("#exFields").appendChild(div);
}

const STRIPE_REASON = { product_not_received: "visa:13.1", subscription_canceled: "visa:13.2", product_unacceptable: "visa:13.3", fraudulent: "visa:10.4" };
function importStripe() {
  const err = $("#importErr");
  err.textContent = "";
  let d;
  try { d = JSON.parse($("#stripeJson").value); } catch { err.textContent = "Not valid JSON"; return; }
  const f = $("#newForm");
  if (STRIPE_REASON[d.reason]) f.rule.value = STRIPE_REASON[d.reason];
  if (d.amount) f.amount.value = (d.amount / 100).toFixed(2);
  const ev = d.evidence || {};
  if (ev.customer_name) f.cardholder.value = ev.customer_name;
  $("#exFields").innerHTML = "";
  const textual = Object.entries(ev).filter(([, v]) => typeof v === "string" && v.trim());
  if (textual.length) addExField("Stripe evidence fields", textual.map(([k, v]) => `${k}: ${v}`).join("\n"));
  addExField();
  f.summary.value = f.summary.value || `Stripe dispute reason: ${d.reason || "unknown"}`;
}

function createCase() {
  const f = $("#newForm");
  const [network, code] = f.rule.value.split(":");
  const exhibits = [...document.querySelectorAll(".ex-field")].map((el, i) => ({ id: `E${i + 1}`, title: $(".ex-t", el).value || `Exhibit ${i + 1}`, kind: "uploaded", text: $(".ex-x", el).value.trim() })).filter((e) => e.text);
  if (!exhibits.length) return;
  const c = {
    id: "case_" + Math.random().toString(36).slice(2, 8),
    merchant: f.merchant.value || "My store", cardholder: f.cardholder.value || "Cardholder", network, code,
    amount: Number(f.amount.value), currency: "USD", opened: new Date().toISOString().slice(0, 10),
    summary: f.summary.value || "Disputed charge", exhibits,
  };
  const custom = store.get("xa.custom", []);
  custom.push(c);
  store.set("xa.custom", custom);
  state.cases.push(c);
  renderInbox();
  select(c.id);
}

boot();
