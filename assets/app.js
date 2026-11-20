/* LARIS dashboard – static, reads ./data/*.json. No build step. */
(function () {
  "use strict";

  const FILES = ["project", "deliverables", "issues", "invoices", "fieldops", "meetings"];

  // About 10 working days: the review period IGN FI cites before it treats a deliverable as invoiceable.
  const REVIEW_DAYS = 14;

  const STAGES = {
    awaiting_review: { label: "Awaiting client review", tone: "warning", waiting: true },
    revised: { label: "Revised – re-review", tone: "warning", waiting: true },
    comments_sent: { label: "Comments sent to IGN FI", tone: "neutral", waiting: false },
    accepted: { label: "Accepted", tone: "good", waiting: false }
  };
  const SEVERITY = {
    high: { label: "High", tone: "critical", rank: 0 },
    medium: { label: "Medium", tone: "serious", rank: 1 },
    low: { label: "Low", tone: "warning", rank: 2 }
  };
  const INVOICE = {
    awaiting_countersignature: { label: "Awaiting PS countersignature", tone: "serious" },
    not_yet_invoiced: { label: "Not yet invoiced", tone: "neutral" },
    countersigned: { label: "Countersigned", tone: "warning" },
    paid: { label: "Paid", tone: "good" }
  };
  const OPS = [
    { key: "blocked", label: "Blocked", tone: "critical" },
    { key: "in_progress", label: "In progress", tone: "warning" },
    { key: "planned", label: "Planned", tone: "neutral" },
    { key: "check", label: "To confirm", tone: "serious" },
    { key: "done", label: "Done", tone: "good" }
  ];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pill = (tone, label) => `<span class="pill ${tone}">${esc(label)}</span>`;

  // "Today" is the real date; ?asof=YYYY-MM-DD overrides it (handy for checking a snapshot).
  const params = new URLSearchParams(location.search);
  const today = parseDate(params.get("asof")) || startOfDay(new Date());

  function parseDate(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function fmt(s, withYear = true) {
    const d = parseDate(s);
    if (!d) return "—";
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d.getDate()} ${M[d.getMonth()]}${withYear ? " " + d.getFullYear() : ""}`;
  }
  function daysSince(s) {
    const d = parseDate(s);
    return d ? Math.round((today - d) / 86400000) : null;
  }

  async function load() {
    const out = {};
    await Promise.all(FILES.map(async (f) => {
      const res = await fetch(`data/${f}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`data/${f}.json – HTTP ${res.status}`);
      out[f] = await res.json();
    }));
    return out;
  }

  function render(D) {
    const compName = Object.fromEntries(D.project.components.map((c) => [c.code, c.name]));
    const compLabel = (code) => code ? `<span class="tag" title="${esc(compName[code] || "")}">${esc(code)}</span>` : "";

    $("#asof").innerHTML = `Data as of <strong>${fmt(D.project.as_of)}</strong><br>Viewed ${fmt(fmtISO(today))}`;
    $("#data-note").textContent = D.project.data_note || "";

    // Derived figures
    const deliv = D.deliverables.map((d) => {
      const st = STAGES[d.stage] || { label: d.stage, tone: "neutral", waiting: false };
      const since = d.revised || d.delivered;
      return Object.assign({}, d, { st, wait: st.waiting ? daysSince(since) : null });
    });
    const waiting = deliv.filter((d) => d.st.waiting);
    const oldest = waiting.reduce((a, b) => (b.wait > (a ? a.wait : -1) ? b : a), null);
    const lettersIssued = deliv.filter((d) => d.letter_of_acceptance).length;
    const invAwait = D.invoices.filter((i) => i.status === "awaiting_countersignature");
    const invPaid = D.invoices.filter((i) => i.status === "paid").length;
    const openIssues = D.issues.filter((i) => i.status !== "closed");
    const highOpen = openIssues.filter((i) => i.severity === "high");

    // KPI tiles
    const kpis = [
      { label: "Deliverables submitted", value: deliv.length, hint: `${new Set(deliv.map((d) => d.component)).size} components` },
      { label: "Waiting on client review", value: waiting.length, hint: oldest ? `Oldest: D${oldest.no}, ${oldest.wait} days` : "None waiting" },
      { label: "Letters of acceptance issued", value: `${lettersIssued}<small> / ${deliv.length}</small>`, hint: "IGN FI is asking for them" },
      { label: "Invoices awaiting countersignature", value: invAwait.length, hint: `${invPaid} paid on record` },
      { label: "High-severity issues open", value: highOpen.length, hint: `${openIssues.length} open in total` }
    ];
    $("#kpis").innerHTML = kpis.map((k) => `
      <div class="kpi"><p class="label">${esc(k.label)}</p><p class="value">${k.value}</p><p class="hint">${esc(k.hint)}</p></div>`).join("");

    // Client-side action list
    const actions = openIssues.filter((i) => i.side === "client")
      .sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || (a.raised < b.raised ? -1 : 1));
    $("#actions").innerHTML = actions.length ? actions.map((i) => `
      <li>
        <div>${pill(SEVERITY[i.severity].tone, SEVERITY[i.severity].label)}</div>
        <div><div class="t">${esc(i.title)}</div><div class="d">${esc(i.next_step || i.detail || "")}</div></div>
        <div class="who">${esc(i.owner)} · since ${fmt(i.raised, false)}</div>
      </li>`).join("") : `<li class="empty">Nothing waiting on the client side.</li>`;

    // Deliverables table + filters
    const fComp = $("#f-deliv-comp"), fStage = $("#f-deliv-stage");
    [...new Set(deliv.map((d) => d.component))].sort(compSort).forEach((c) => fComp.add(new Option(`${c} – ${compName[c] || ""}`, c)));
    [...new Set(deliv.map((d) => d.stage))].forEach((s) => fStage.add(new Option((STAGES[s] || {}).label || s, s)));
    const maxWait = Math.max(1, ...waiting.map((d) => d.wait || 0));

    function drawDeliv() {
      const rows = deliv
        .filter((d) => (!fComp.value || d.component === fComp.value) && (!fStage.value || d.stage === fStage.value))
        .sort((a, b) => (b.wait ?? -1) - (a.wait ?? -1) || (a.delivered < b.delivered ? -1 : 1));
      $("#t-deliv tbody").innerHTML = rows.length ? rows.map((d) => {
        const late = d.wait != null && d.wait > REVIEW_DAYS;
        const waitCell = d.wait == null ? "—" :
          `<span class="days-bar${late ? " late" : ""}" title="${late ? "Past ~10 working days" : "Within ~10 working days"}"><span class="bar" style="width:${Math.max(4, Math.round(60 * d.wait / maxWait))}px"></span>${d.wait}</span>`;
        const claimed = d.contractual_acceptance_claimed ? `<span class="note">IGN FI claims contractual acceptance</span>` : "";
        return `<tr>
          <td class="nowrap">D${esc(d.no)}</td>
          <td>${compLabel(d.component)}</td>
          <td>${esc(d.title)}<span class="note">${esc(d.note)}</span></td>
          <td class="nowrap">${fmt(d.delivered)}${d.revised ? `<span class="note">Revised ${fmt(d.revised)}</span>` : ""}</td>
          <td>${pill(d.st.tone, d.st.label)}</td>
          <td class="num">${waitCell}</td>
          <td class="nowrap">${esc(d.invoice || "—")}</td>
          <td>${d.letter_of_acceptance ? pill("good", "Issued") : pill("neutral", "Not issued")}${claimed}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="8" class="empty">No deliverables match these filters.</td></tr>`;
    }
    fComp.onchange = fStage.onchange = drawDeliv;
    drawDeliv();

    // Issues table
    const fSev = $("#f-iss-sev"), fSide = $("#f-iss-side");
    function drawIssues() {
      const rows = openIssues
        .filter((i) => (!fSev.value || i.severity === fSev.value) && (!fSide.value || i.side === fSide.value))
        .sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank || (a.raised < b.raised ? -1 : 1));
      $("#t-issues tbody").innerHTML = rows.length ? rows.map((i) => `<tr>
          <td>${pill(SEVERITY[i.severity].tone, SEVERITY[i.severity].label)}</td>
          <td>${esc(i.title)}<span class="note">${esc(i.detail)}</span></td>
          <td>${esc(i.area)} ${compLabel(i.component)}</td>
          <td>${esc(i.owner)}</td>
          <td class="nowrap">${fmt(i.raised)}</td>
          <td>${esc(i.next_step)}</td>
        </tr>`).join("") : `<tr><td colspan="6" class="empty">No open issues match these filters.</td></tr>`;
    }
    fSev.onchange = fSide.onchange = drawIssues;
    drawIssues();

    // Invoices
    const withAmount = D.invoices.filter((i) => i.amount != null);
    $("#fin-note").textContent = withAmount.length === D.invoices.length ? "" :
      "Amounts aren't recorded yet. Add them in data/invoices.json from the invoice PDFs.";
    $("#t-inv tbody").innerHTML = D.invoices.map((i) => {
      const s = INVOICE[i.status] || { label: i.status, tone: "neutral" };
      const amt = i.amount != null ? `${Number(i.amount).toLocaleString("en-GB")} ${esc(i.currency || "")}` : "—";
      return `<tr>
        <td class="nowrap"><strong>${esc(i.ref)}</strong></td>
        <td>${compLabel(i.component)}</td>
        <td class="nowrap">${(i.deliverables || []).map((n) => "D" + n).join(", ")}</td>
        <td class="nowrap">${fmt(i.first_sent)}</td>
        <td class="num">${amt}</td>
        <td>${pill(s.tone, s.label)}${i.paid ? `<span class="note">Paid ${fmt(i.paid)}</span>` : ""}</td>
        <td><span class="note" style="margin:0">${esc(i.note)}</span></td>
      </tr>`;
    }).join("");

    // Field ops board
    $("#board").innerHTML = OPS.map((col) => {
      const items = D.fieldops.filter((f) => f.status === col.key);
      if (!items.length) return "";
      return `<div class="col">
        <h3>${pill(col.tone, col.label)}<span class="count">${items.length}</span></h3>
        ${items.map((f) => `<div class="card">
          <div class="t">${compLabel(f.component)} ${esc(f.activity)}</div>
          <div class="meta">${esc(f.location || "")}${dateRange(f.start, f.end)}</div>
          <div class="n">${esc(f.note)}</div>
        </div>`).join("")}
      </div>`;
    }).join("");

    // Meetings
    const up = D.meetings.filter((m) => !m.date || parseDate(m.date) >= today)
      .sort((a, b) => (a.date || "9999") < (b.date || "9999") ? -1 : 1);
    const past = D.meetings.filter((m) => m.date && parseDate(m.date) < today)
      .sort((a, b) => (a.date > b.date ? -1 : 1)).slice(0, 8);
    const li = (m) => `<li>
      <div class="when">${m.date ? fmt(m.date, false) : "To set"}${m.time ? `<br>${esc(m.time)}` : ""}</div>
      <div><div class="t">${esc(m.title)}</div><div class="n">${[m.location, m.note].filter(Boolean).map(esc).join(" · ")}</div></div>
    </li>`;
    $("#m-up").innerHTML = up.length ? up.map(li).join("") : `<li class="empty">Nothing scheduled.</li>`;
    $("#m-past").innerHTML = past.length ? past.map(li).join("") : `<li class="empty">None.</li>`;
  }

  function dateRange(s, e) {
    if (!s && !e) return "";
    if (s && e) return ` · ${fmt(s, false)} – ${fmt(e, false)}`;
    return s ? ` · from ${fmt(s, false)}` : ` · ${fmt(e, false)}`;
  }
  function fmtISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function compSort(a, b) {
    const n = (s) => parseFloat(s.slice(1)) + (s.endsWith("b") ? 0.5 : 0);
    return n(a) - n(b);
  }

  load().then(render).catch((err) => {
    const box = $("#load-error");
    box.hidden = false;
    box.innerHTML = location.protocol === "file:"
      ? `The dashboard can't read its data files when opened straight from disk. Run <code>python3 -m http.server</code> in this folder and open <code>http://localhost:8000</code>, or view it on GitHub Pages.`
      : `Couldn't load the dashboard data (${esc(err.message)}). Check that the JSON files in <code>/data</code> are valid.`;
    console.error(err);
  });
})();
