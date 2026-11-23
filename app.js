/*
 * TUSI app: screens, forms and wiring.
 * All text from the user is placed with textContent, never as HTML.
 * Depends on TusiEngine (js/engine.js) and TusiStore (js/store.js).
 */
(function () {
  "use strict";

  const E = window.TusiEngine;
  const Store = window.TusiStore;
  const APP_VERSION = "1.0.1";
  const MAX_AMOUNT = 10000000;
  const FREQ_LABEL = { weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", once: "One time" };

  /* ---------- Small DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "value") el.value = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k of Object.keys(attrs || {})) el.setAttribute(k, attrs[k]);
    for (const kid of kids.flat()) if (kid) el.appendChild(kid);
    return el;
  }
  function icon(id, cls) { return s("svg", { "aria-hidden": "true", class: cls || "" }, s("use", { href: "#" + id })); }
  function mark() { return h("span", { class: "mkc" }, s("svg", { viewBox: "0 0 64 64", "aria-hidden": "true" }, s("use", { href: "#tusi-mark" }))); }
  const $ = (sel) => document.querySelector(sel);

  /* ---------- Formatting ---------- */
  const fm0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const fm2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MINUS = "−";
  function m0(n) { const r = Math.round(n); return (r < 0 ? MINUS : "") + fm0.format(Math.abs(r)); }
  function m2(n) { return (n < 0 ? MINUS : "") + fm2.format(Math.abs(n)); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function today() { return E.parseDate(E.iso(new Date())); }
  function dayOff(n) { return E.addDays(today(), n); }
  function fmtDate(d, o) { return d.toLocaleDateString("en-US", o); }
  function longDay(n) { return fmtDate(dayOff(n), { weekday: "long", month: "long", day: "numeric" }); }
  function shortDay(n) { return n === 0 ? "Today" : n === 1 ? "Tomorrow" : fmtDate(dayOff(n), { month: "short", day: "numeric" }); }
  function monthDay(n) { return fmtDate(dayOff(n), { month: "long", day: "numeric" }); }
  function daysSince(isoStr) { const d = E.parseDate(isoStr || ""); return d ? E.diffDays(d, today()) : Infinity; }
  function parseMoney(str) {
    if (typeof str !== "string") return NaN;
    const clean = str.replace(/[$,\s]/g, "");
    if (!/^\d*\.?\d{0,2}$/.test(clean) || clean === "" || clean === ".") return NaN;
    return Math.round(Number(clean) * 100) / 100;
  }
  function uid() {
    const a = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- State ---------- */
  function blankState() {
    return {
      version: 1, setupDone: false, sample: false,
      balance: 0, daily: 30, buffer: 0, incomes: [], bills: [], log: [],
      balanceUpdated: E.iso(today()), lastCheckin: E.iso(today()), setupDate: E.iso(today()), lastBackup: null,
      settings: { theme: "dark", range: 30 }
    };
  }
  function sampleState() {
    const t = today(), iso = (n) => E.iso(E.addDays(t, n));
    const st = blankState();
    Object.assign(st, {
      setupDone: true, sample: true, balance: 1640, daily: 42, buffer: 100, lastCheckin: iso(-8),
      incomes: [{ id: uid(), name: "Paycheck", amount: 780, freq: "biweekly", next: iso(6) }],
      bills: [
        { id: uid(), name: "Rent", amount: 1100, freq: "monthly", next: iso(2) },
        { id: uid(), name: "Phone", amount: 65, freq: "monthly", next: iso(4) },
        { id: uid(), name: "Car insurance", amount: 140, freq: "monthly", next: iso(11) },
        { id: uid(), name: "Streaming", amount: 16, freq: "monthly", next: iso(15) }
      ],
      log: [
        { id: uid(), date: iso(-1), t: Date.now() - 864e5, amt: 38.5, note: "Groceries" },
        { id: uid(), date: iso(-2), t: Date.now() - 2 * 864e5, amt: 12.25, note: "Lunch" },
        { id: uid(), date: iso(-3), t: Date.now() - 3 * 864e5, amt: 45, note: "Gas" },
        { id: uid(), date: iso(-5), t: Date.now() - 5 * 864e5, amt: 22, note: "Pharmacy" }
      ]
    });
    return st;
  }
  function normalize(raw) {
    const base = blankState();
    if (!raw || typeof raw !== "object") return base;
    const c = E.cleanState(raw);
    const keepId = (list) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x === "object");
    const withIds = (orig, cleaned) => cleaned.map((it) => {
      const o = keepId(orig).find((x) => x.name === it.name && Number(x.amount) === it.amount && x.next === it.next && x.freq === it.freq);
      return Object.assign({ id: (o && typeof o.id === "string" && o.id.slice(0, 24)) || uid() }, it, { name: it.name.slice(0, 40) });
    });
    const log = keepId(raw.log).map((x) => ({
      id: typeof x.id === "string" ? x.id.slice(0, 24) : uid(),
      date: E.parseDate(x.date) ? x.date : (isFinite(x.t) ? E.iso(new Date(x.t)) : null),
      t: isFinite(x.t) ? Number(x.t) : Date.now(),
      amt: Math.round(Number(x.amt) * 100) / 100,
      note: typeof x.note === "string" ? x.note.slice(0, 40) : ""
    })).filter((x) => x.date && x.amt > 0 && x.amt <= MAX_AMOUNT).slice(0, 500);
    const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
    return Object.assign(base, {
      setupDone: raw.setupDone === true, sample: raw.sample === true,
      balance: Math.max(-MAX_AMOUNT, Math.min(MAX_AMOUNT, c.balance)), daily: Math.min(MAX_AMOUNT, c.daily), buffer: Math.min(MAX_AMOUNT, c.buffer),
      incomes: withIds(raw.incomes, c.incomes).slice(0, 100), bills: withIds(raw.bills, c.bills).slice(0, 200), log: log,
      balanceUpdated: E.parseDate(raw.balanceUpdated) ? raw.balanceUpdated : base.balanceUpdated,
      lastCheckin: E.parseDate(raw.lastCheckin) ? raw.lastCheckin : base.lastCheckin,
      setupDate: E.parseDate(raw.setupDate) ? raw.setupDate : base.setupDate,
      lastBackup: E.parseDate(raw.lastBackup) ? raw.lastBackup : null,
      settings: {
        theme: ["system", "light", "dark"].includes(settings.theme) ? settings.theme : "system",
        range: [30, 60, 90, 180].includes(settings.range) ? settings.range : 30
      }
    });
  }

  let S = blankState();
  let saveTimer = null;
  function commit(opts) {
    if (!(opts && opts.quiet)) render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      Store.save(S).catch(() => toast("Could not save on this device. Your last change may be lost."));
    }, 150);
  }
  function analysis() { return E.analyze(S, { mode: "tusi", today: today() }); }

  /* ---------- Theme ---------- */
  function applyTheme() {
    const t = S.settings.theme;
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    const dark = t === "dark" || (t === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const meta = document.getElementById("theme-color");
    if (meta) meta.setAttribute("content", dark ? "#0f1e24" : "#e2eaee");
  }

  /* ---------- Install and offline ---------- */
  const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installPrompt = null;
  function setupInstall() {
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; if (current === "more") renderMore(); });
    window.addEventListener("appinstalled", () => { installPrompt = null; if (current === "more") renderMore(); });
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    let reloading = false;
    const offerUpdate = (worker) => toast("A new version of TUSI is ready.", "Update", () => worker.postMessage("skip-waiting"));
    navigator.serviceWorker.register("sw.js").then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offerUpdate(w); });
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading || !hadController) return; reloading = true; location.reload(); });
  }
  /* ---------- Backup and restore ---------- */
  const B = window.TusiBackup;
  async function saveBackup() {
    const json = JSON.stringify(B.make(S, { appVersion: APP_VERSION }), null, 2);
    const name = B.fileName();
    let file = null;
    try { file = new File([json], name, { type: "application/json" }); } catch (e) { file = null; }
    const markDone = () => { S.lastBackup = E.iso(today()); commit(); toast("Backup saved. Keep the file somewhere safe, like iCloud Drive."); };
    if (file && isIOS() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "TUSI backup" }); markDone(); }
      catch (e) { if (e && e.name !== "AbortError") toast("Could not share the backup. Try again."); }
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = h("a", { href: url, download: name, hidden: true });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    markDone();
  }
  function pickBackup() {
    const input = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return;
      if (f.size > B.MAX_BYTES) { restoreSheet({ ok: false, error: "The file is too large to be a TUSI backup." }); return; }
      let txt = "";
      try { txt = await f.text(); } catch (e) { restoreSheet({ ok: false, error: "The file could not be opened." }); return; }
      restoreSheet(B.check(txt));
    });
    document.body.appendChild(input);
    input.click();
  }
  function restoreSheet(res) {
    openSheet(res.ok ? "Restore this backup?" : "Could not restore", (body, close) => {
      if (!res.ok) {
        body.appendChild(h("div", { class: "form" },
          h("p", { class: "lead", role: "alert", text: res.error }),
          h("p", { class: "hint", text: "Your current numbers were not changed." }),
          h("button", { class: "btn primary wide-btn", type: "button", text: "OK", "data-autofocus": "", onclick: close })));
        return;
      }
      const sm = res.summary;
      const when = sm.exported ? fmtDate(new Date(sm.exported), { month: "long", day: "numeric", year: "numeric" }) : "an unknown date";
      body.appendChild(h("div", { class: "form" },
        h("p", { class: "lead", text: "This backup was saved on " + when + "." }),
        h("div", { class: "facts three" },
          h("div", null, h("b", { text: m2(sm.balance) }), h("span", { text: "Balance" })),
          h("div", null, h("b", { text: String(sm.incomes + sm.bills) }), h("span", { text: plural(sm.incomes, "income") + ", " + plural(sm.bills, "bill") })),
          h("div", null, h("b", { text: String(sm.purchases) }), h("span", { text: "Purchases" }))),
        h("p", { class: "hint", text: "This replaces everything TUSI has on this device right now. Save a backup first if you want to keep it." }),
        h("button", { class: "btn danger wide-btn", type: "button", text: "Replace my data", onclick: () => {
          S = normalize(Object.assign({}, res.data, { setupDone: true, sample: false, lastBackup: E.iso(today()) }));
          applyTheme(); animateHome = true; close();
          location.hash = "#home"; commit();
          Store.persist();
          toast("Backup restored");
        } }),
        h("button", { class: "btn quiet", type: "button", text: "Cancel", "data-autofocus": "", onclick: close })));
    });
  }
  function backupNote() {
    if (!S.lastBackup) return "No backup yet. A backup is one small file you keep, for a new phone or to move between phone and laptop.";
    const d = daysSince(S.lastBackup);
    const when = d === 0 ? "today" : d === 1 ? "yesterday" : d + " days ago";
    return "Last backup " + when + "." + (d >= 30 ? " Time for a fresh one." : "");
  }
  function installCard() {
    if (isStandalone()) {
      return h("section", { class: "card iconrow", "aria-labelledby": "in-ok" },
        h("span", { class: "circle mint" }, icon("i-check")),
        h("div", null, h("h2", { id: "in-ok", text: "Installed" }), h("p", { text: "TUSI is on your home screen and works without internet." })));
    }
    let body;
    if (installPrompt) {
      body = [h("p", { text: "Add TUSI to this device so it opens like an app and works without internet." }),
        h("div", { class: "btn-row" }, h("button", { class: "btn primary small", type: "button", text: "Install TUSI", onclick: async () => {
          const p = installPrompt; installPrompt = null;
          try { p.prompt(); await p.userChoice; } catch (e) { /* ignored */ }
          renderMore();
        } }))];
    } else if (isIOS()) {
      body = [h("p", { text: "Put TUSI on your home screen so it opens like an app and works without internet." }),
        h("ol", { class: "steps-list" },
          h("li", { text: "Open this page in Safari." }),
          h("li", { text: "Tap the Share button at the bottom of the screen." }),
          h("li", { text: "Choose Add to Home Screen, then tap Add." })),
        h("p", { class: "hint", text: "The home screen app keeps its own copy of your numbers, separate from Safari. Install first, then set up inside the app." })];
    } else {
      body = [h("p", { text: "Use your browser menu and choose Install or Add to Home Screen. TUSI then opens like an app and works without internet." })];
    }
    return h("section", { class: "card iconrow", "aria-labelledby": "in-l" },
      h("span", { class: "circle teal" }, icon("i-plus")),
      h("div", null, h("h2", { id: "in-l", text: "Add TUSI to your home screen" }), body));
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, actionLabel, action) {
    const el = $("#toast");
    el.replaceChildren(h("span", { text: msg }));
    if (actionLabel) el.appendChild(h("button", { type: "button", text: actionLabel, onclick: () => { el.hidden = true; action(); } }));
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, actionLabel ? 7000 : 4000);
  }

  /* ---------- Sheets (dialogs) ---------- */
  const sheet = () => $("#sheet");
  let lastFocus = null;
  function openSheet(title, build) {
    const dlg = sheet();
    lastFocus = document.activeElement;
    const close = () => { if (dlg.open) dlg.close(); };
    const body = h("div", { class: "sheet-in" },
      h("div", { class: "grab", "aria-hidden": "true" }),
      h("div", { class: "sheet-head" },
        h("span", { "aria-hidden": "true" }),
        h("h2", { id: "sheet-title", text: title }),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: close }, icon("i-close"))));
    build(body, close);
    dlg.replaceChildren(body);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    const first = dlg.querySelector("[data-autofocus], input, select");
    if (first) setTimeout(() => first.focus(), 30);
  }
  function setupSheetEvents() {
    const dlg = sheet();
    dlg.addEventListener("close", () => { dlg.replaceChildren(); if (lastFocus && lastFocus.focus) lastFocus.focus(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  }

  /* Form field builders */
  function moneyField(id, label, value, opts) {
    opts = opts || {};
    const input = h("input", { class: "input", id: id, type: "text", inputmode: "decimal", autocomplete: "off", enterkeyhint: "done",
      value: value === null || value === undefined || value === "" ? "" : String(value), placeholder: opts.placeholder || "0", "aria-describedby": id + "-err" });
    return h("div", { class: "field" },
      h("label", { for: id, text: label }),
      h("div", { class: "money" + (opts.big ? " big-input" : "") }, input),
      opts.hint ? h("p", { class: "hint", text: opts.hint }) : null,
      h("p", { class: "err", id: id + "-err", "aria-live": "polite" }));
  }
  function textField(id, label, value, opts) {
    opts = opts || {};
    return h("div", { class: "field" },
      h("label", { for: id, text: label }),
      h("input", { class: "input", id: id, type: opts.type || "text", maxlength: opts.max || 40, value: value || "", placeholder: opts.placeholder || "", autocomplete: "off" }),
      h("p", { class: "err", id: id + "-err", "aria-live": "polite" }));
  }
  function freqField(id, value) {
    return h("div", { class: "field" },
      h("label", { for: id, text: "How often" }),
      h("select", { class: "select", id: id },
        E.FREQS.map((f) => h("option", { value: f, selected: f === value, text: FREQ_LABEL[f] }))));
  }
  function setErr(id, msg) { const el = document.getElementById(id + "-err"); if (el) el.textContent = msg || ""; const inp = document.getElementById(id); if (inp) inp.setAttribute("aria-invalid", msg ? "true" : "false"); }
  function readMoney(id, opts) {
    opts = opts || {};
    const raw = document.getElementById(id).value.trim();
    if (raw === "" && opts.allowEmpty) { setErr(id, ""); return 0; }
    let v = parseMoney(raw.replace(/^-/, ""));
    if (opts.allowNegative && raw.startsWith("-")) v = -v;
    if (!isFinite(v)) { setErr(id, "Enter an amount like 25 or 25.50"); return null; }
    if (Math.abs(v) > MAX_AMOUNT) { setErr(id, "That amount is too large"); return null; }
    if (opts.positive && !(v > 0)) { setErr(id, "Enter an amount above zero"); return null; }
    setErr(id, "");
    return v;
  }

  /* ---------- Actions ---------- */
  const QUICK = [5, 10, 20, 50, 100];
  const CATS = ["Food", "Gas", "Coffee", "Fun", "Shopping", "Other"];
  function logPurchaseSheet(prefill) {
    openSheet("Log a purchase", (body, close) => {
      let cat = "";
      const amtInput = h("input", { id: "lp-amt", type: "text", inputmode: "decimal", autocomplete: "off", enterkeyhint: "done",
        "aria-label": "Amount in dollars", "aria-describedby": "lp-amt-err lp-impact", placeholder: "$0", value: prefill ? "$" + prefill : "" });
      const read = () => parseMoney(amtInput.value.trim());
      const quickBtns = QUICK.map((q) => h("button", { type: "button", "aria-pressed": "false", text: "$" + q, onclick: () => { amtInput.value = "$" + q; sync(); } }));
      const other = h("button", { type: "button", text: "Other", onclick: () => { amtInput.value = ""; amtInput.focus(); sync(); } });
      const step = (d) => { const v = read(); const n = Math.max(0, Math.round(((isFinite(v) ? v : 0) + d) * 100) / 100); amtInput.value = n ? "$" + n : ""; sync(); };
      const catBtns = CATS.map((c) => h("button", { type: "button", "aria-pressed": "false", text: c, onclick: () => { cat = cat === c ? "" : c; catBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === cat))); } }));
      const impact = h("p", { class: "impact", id: "lp-impact", "aria-live": "polite" });
      const go = h("button", { class: "btn primary wide-btn", type: "submit", text: "Log purchase" });
      function sync() {
        const v = read();
        quickBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(v === QUICK[i])));
        if (v > 0 && v <= MAX_AMOUNT) {
          const before = analysis().summary().safeToday;
          const after = E.analyze(Object.assign({}, S, { balance: S.balance - v, log: [{ date: E.iso(today()), amt: v }].concat(S.log) }), { mode: "tusi", today: today() }).summary().safeToday;
          impact.textContent = "Safe to spend today goes from " + m0(before) + " to " + m0(after) + ".";
          go.textContent = "Log " + m2(v);
        } else { impact.textContent = "Logging lowers your balance right away."; go.textContent = "Log purchase"; }
      }
      amtInput.addEventListener("input", sync);
      amtInput.addEventListener("focus", () => { if (!amtInput.value) amtInput.value = "$"; });
      amtInput.addEventListener("blur", () => { if (amtInput.value === "$") amtInput.value = ""; });
      const form = h("form", { class: "form", novalidate: true },
        h("div", { class: "stepper" },
          h("button", { type: "button", "aria-label": "One dollar less", onclick: () => step(-1) }, icon("i-minus")),
          amtInput,
          h("button", { type: "button", "aria-label": "One dollar more", onclick: () => step(1) }, icon("i-plus"))),
        h("p", { class: "err", id: "lp-amt-err", "aria-live": "polite" }),
        h("div", { class: "chipgrid", role: "group", "aria-label": "Quick amounts" }, quickBtns, other),
        h("p", { class: "hint", text: "What was it for" }),
        h("div", { class: "cats", role: "group", "aria-label": "Category" }, catBtns),
        impact, go);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const amt = read();
        const errEl = document.getElementById("lp-amt-err");
        if (!(amt > 0)) { errEl.textContent = "Enter an amount above zero, like 12 or 12.50"; amtInput.focus(); return; }
        if (amt > MAX_AMOUNT) { errEl.textContent = "That amount is too large"; return; }
        const before = analysis().summary();
        const entry = { id: uid(), date: E.iso(today()), t: Date.now(), amt: amt, note: cat };
        S.log.unshift(entry);
        S.log = S.log.slice(0, 500);
        S.balance = Math.round((S.balance - amt) * 100) / 100;
        commit();
        const after = analysis().summary();
        const rw = after.runway === Infinity ? "365+" : String(after.runway);
        const doneBtn = h("button", { class: "btn primary wide-btn", type: "button", text: "Done", "data-autofocus": "", onclick: close });
        body.replaceChildren(
          h("div", { class: "grab", "aria-hidden": "true" }),
          h("div", { class: "done-state", role: "status" },
            h("div", { class: "orb", "aria-hidden": "true" }, icon("i-bigcheck")),
            h("h2", { text: "Logged" }),
            h("p", { text: m2(amt) + (cat ? " for " + cat : "") + ". Your numbers are up to date." }),
            h("div", { class: "facts" },
              h("div", null, h("b", { text: m0(after.safeToday) }), h("span", { text: "Left to spend today, was " + m0(before.safeToday) })),
              h("div", null, h("b", { text: rw + " days" }), h("span", { text: "Runway" })))),
          doneBtn,
          h("button", { class: "btn quiet", type: "button", text: "Undo", onclick: () => { removeLog(entry.id, true); close(); toast("Purchase removed"); } }));
        setTimeout(() => doneBtn.focus(), 30);
      });
      body.appendChild(form);
      sync();
    });
  }
  function removeLog(id, silent) {
    const i = S.log.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [x] = S.log.splice(i, 1);
    S.balance = Math.round((S.balance + x.amt) * 100) / 100;
    commit();
    if (!silent) toast("Removed " + m2(x.amt) + ". Balance restored.", "Undo", () => { S.log.splice(i, 0, x); S.balance = Math.round((S.balance - x.amt) * 100) / 100; commit(); });
  }

  function balanceSheet() {
    openSheet("Update balance", (body, close) => {
      const form = h("form", { class: "form", novalidate: true },
        moneyField("bal", "Money you have right now", S.balance, { big: true, hint: "Check your bank app and enter the total you can spend from. Use a minus sign if you are overdrawn." }),
        h("button", { class: "btn primary wide-btn", type: "submit", text: "Save balance" }));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = readMoney("bal", { allowNegative: true });
        if (v === null) return;
        S.balance = v; S.balanceUpdated = E.iso(today());
        close(); commit(); toast("Balance saved");
      });
      body.appendChild(form);
    });
  }
  function numberSheet(key) {
    const meta = key === "daily"
      ? { title: "Daily spending", label: "Typical spending per day", hint: "Food, gas, coffee, fun. Everything that is not a bill." }
      : { title: "Cushion", label: "Money to keep untouched", hint: "Safe to spend keeps this much aside. Zero is fine." };
    openSheet(meta.title, (body, close) => {
      const form = h("form", { class: "form", novalidate: true },
        moneyField("num", meta.label, S[key], { big: true, hint: meta.hint }),
        h("button", { class: "btn primary wide-btn", type: "submit", text: "Save" }));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = readMoney("num", { allowEmpty: true });
        if (v === null) return;
        S[key] = v; close(); commit(); toast("Saved");
      });
      body.appendChild(form);
    });
  }

  function itemSheet(kind, existing) {
    const list = kind === "income" ? S.incomes : S.bills;
    const noun = kind === "income" ? "income" : "bill";
    const it = existing || { name: "", amount: "", freq: kind === "income" ? "biweekly" : "monthly", next: E.iso(today()) };
    openSheet(existing ? "Edit " + noun : "Add " + noun, (body, close) => {
      const form = h("form", { class: "form", novalidate: true },
        textField("it-name", "Name", it.name, { placeholder: kind === "income" ? "Paycheck" : "Rent" }),
        moneyField("it-amt", "Amount", it.amount),
        h("div", { class: "two" },
          freqField("it-freq", it.freq),
          h("div", { class: "field" }, h("label", { for: "it-next", text: "Next date" }),
            h("input", { class: "input", id: "it-next", type: "date", value: it.next, required: true }),
            h("p", { class: "err", id: "it-next-err", "aria-live": "polite" }))),
        h("p", { class: "hint muted", text: "Monthly items on the 29th, 30th or 31st move to the last day in shorter months." }),
        h("button", { class: "btn primary wide-btn", type: "submit", text: existing ? "Save changes" : "Add " + noun }));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("it-name").value.trim().slice(0, 40);
        const amt = readMoney("it-amt", { positive: true });
        const next = document.getElementById("it-next").value;
        const okDate = !!E.parseDate(next);
        setErr("it-next", okDate ? "" : "Pick a date");
        if (amt === null || !okDate) return;
        const freq = document.getElementById("it-freq").value;
        const data = { name: name || (kind === "income" ? "Income" : "Bill"), amount: amt, freq: E.FREQS.includes(freq) ? freq : "monthly", next: next };
        if (existing) Object.assign(existing, data); else list.push(Object.assign({ id: uid() }, data));
        close(); commit(); toast(existing ? "Saved" : "Added " + data.name);
      });
      body.appendChild(form);
      if (existing) {
        const confirmRow = h("div", { class: "result", hidden: true },
          h("p", { text: "Delete " + (existing.name || noun) + "? This cannot be undone." }),
          h("div", { class: "btn-row" },
            h("button", { class: "btn danger", type: "button", text: "Delete", onclick: () => {
              const i = list.indexOf(existing); if (i >= 0) list.splice(i, 1); close(); commit(); toast("Deleted " + (existing.name || noun));
            } }),
            h("button", { class: "btn", type: "button", text: "Keep it", onclick: () => { confirmRow.hidden = true; delBtn.hidden = false; } })));
        const delBtn = h("button", { class: "btn quiet", type: "button", text: "Delete this " + noun, onclick: () => { confirmRow.hidden = false; delBtn.hidden = true; } });
        body.appendChild(delBtn); body.appendChild(confirmRow);
      }
    });
  }

  function affordSheet() {
    openSheet("Can I afford this?", (body, close) => {
      const out = h("div", { class: "result", "aria-live": "polite" }, h("p", { class: "muted", text: "Type a price to see what it does to your runway." }));
      const field = moneyField("af-amt", "Price", "", { big: true });
      const logBtn = h("button", { class: "btn primary wide-btn", type: "button", text: "Log this purchase", disabled: true });
      body.append(field, out, logBtn);
      const input = field.querySelector("input");
      const update = () => {
        const p = parseMoney(input.value.trim());
        logBtn.disabled = !(p > 0);
        if (!(p > 0)) { out.replaceChildren(h("p", { class: "muted", text: "Type a price to see what it does to your runway." })); return; }
        const r = analysis().purchase(p);
        let cls, verdict;
        if (r.alreadyShort) { cls = "bad"; verdict = "Already short before payday"; }
        else if (r.makesShort) { cls = "bad"; verdict = "Not now. This puts you short before payday"; }
        else if (!r.fitsToday) { cls = "warn"; verdict = "More than is safe today"; }
        else { cls = "good"; verdict = "Fits in today's safe amount"; }
        const rw = (x) => (x === Infinity ? "365+" : String(x));
        const lost = (r.runwayBefore === Infinity ? 365 : r.runwayBefore) - (r.runwayAfter === Infinity ? 365 : r.runwayAfter);
        out.replaceChildren(
          h("span", { class: "pill " + cls, text: verdict }),
          r.daysOfSpending !== null ? h("p", null, "That is ", h("b", { text: (r.daysOfSpending < 10 ? r.daysOfSpending.toFixed(1) : Math.round(r.daysOfSpending)) + " days" }), " of your normal spending.") : null,
          h("p", null, "Runway goes from ", h("b", { text: rw(r.runwayBefore) }), " to ", h("b", { text: rw(r.runwayAfter) }), " days" + (lost > 0 ? ", " + plural(lost, "day") + " less." : ".")),
          h("p", { text: "Safe to spend today goes from " + m0(r.safeBefore) + " to " + m0(r.safeAfter) + "." }));
      };
      input.addEventListener("input", update);
      logBtn.addEventListener("click", () => { const p = parseMoney(input.value.trim()); close(); if (p > 0) setTimeout(() => logPurchaseSheet(p), 60); });
    });
  }

  function checkinDone() { S.lastCheckin = E.iso(today()); commit(); toast("Check in done. See you next week."); }

  /* ---------- Log stats ---------- */
  function weekStats() {
    const cut = E.iso(dayOff(-6)), t = E.iso(today());
    const recent = S.log.filter((x) => x.date >= cut && x.date <= t);
    const days = new Set(recent.map((x) => x.date));
    const total = recent.reduce((a, x) => a + x.amt, 0);
    return { total: total, avg: total / 7, days: days.size, count: recent.length };
  }

  /* ---------- Chart ---------- */
  function niceStep(range, n) { const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function moneyShort(v) { const a = Math.abs(v), sign = v < 0 ? MINUS : ""; return a >= 1000 ? sign + "$" + (a / 1000).toFixed(a % 1000 === 0 ? 0 : 1) + "k" : sign + "$" + Math.round(a); }
  /* Monotone cubic curve: smooth, but never overshoots the real balance between days. */
  function smoothPath(px) {
    const n = px.length, dx = [], m = [], t = [];
    if (n < 2) return "";
    for (let i = 0; i < n - 1; i++) { dx[i] = px[i + 1][0] - px[i][0]; m[i] = (px[i + 1][1] - px[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let j = 1; j < n - 1; j++) t[j] = m[j - 1] * m[j] <= 0 ? 0 : (3 * (dx[j - 1] + dx[j])) / ((2 * dx[j] + dx[j - 1]) / m[j - 1] + (dx[j] + 2 * dx[j - 1]) / m[j]);
    let p = "M" + px[0][0].toFixed(1) + " " + px[0][1].toFixed(1);
    for (let k = 0; k < n - 1; k++) {
      const hh = dx[k] / 3;
      p += " C" + (px[k][0] + hh).toFixed(1) + " " + (px[k][1] + hh * t[k]).toFixed(1) + " " + (px[k + 1][0] - hh).toFixed(1) + " " + (px[k + 1][1] - hh * t[k + 1]).toFixed(1) + " " + px[k + 1][0].toFixed(1) + " " + px[k + 1][1].toFixed(1);
    }
    return p;
  }
  function chart(A, R) {
    const pts = A.forecast(R), vals = pts.map((p) => p.balance);
    const mainW = (document.getElementById("main").clientWidth || 640);
    const W = Math.round(Math.max(280, Math.min(900, window.innerWidth >= 900 ? mainW - 520 : mainW - 76)));
    const H = W < 420 ? 210 : 250, l = 46, r = 10, t = 40, b = 28;
    const min = Math.min(...vals), max = Math.max(...vals);
    const ymin = Math.min(0, min), ymax = Math.max(max * 1.05, 100);
    const step = niceStep(ymax - ymin, 3), lo = Math.floor(ymin / step) * step, hi = Math.ceil(ymax / step) * step;
    const X = (k) => l + (k / R) * (W - l - r), Y = (v) => t + (1 - (v - lo) / (hi - lo)) * (H - t - b), y0 = Y(0);
    const line = smoothPath(vals.map((v, k) => [X(k), Y(v)]));
    const area = line + " L" + X(R).toFixed(1) + " " + Y(lo).toFixed(1) + " L" + X(0).toFixed(1) + " " + Y(lo).toFixed(1) + " Z";
    const id = "c" + uid();
    const g = [];
    for (let v = lo; v <= hi + 1e-6; v += step) {
      g.push(s("line", { x1: l, x2: W - r, y1: Y(v).toFixed(1), y2: Y(v).toFixed(1), stroke: "var(--line)", "stroke-dasharray": "3 6" }));
      const tx = s("text", { x: l - 8, y: (Y(v) + 4).toFixed(1), "text-anchor": "end", class: "axis" }); tx.textContent = moneyShort(v); g.push(tx);
    }
    [0, Math.round(R / 2), R].forEach((k, i) => { const tx = s("text", { x: X(k).toFixed(1), y: H - 6, "text-anchor": i === 0 ? "start" : i === 2 ? "end" : "middle", class: "axis" }); tx.textContent = k === 0 ? "Today" : shortDay(k); g.push(tx); });
    const marks = [];
    pts.forEach((p, k) => {
      if (p.events.some((e) => e.type === "out")) marks.push(s("circle", { cx: X(k).toFixed(1), cy: Y(p.balance).toFixed(1), r: "4.5", fill: "var(--bg)", stroke: "var(--bad)", "stroke-width": "2.2" }));
      if (p.events.some((e) => e.type === "in")) marks.push(s("circle", { cx: X(k).toFixed(1), cy: Y(p.balance).toFixed(1), r: "4.5", fill: "var(--good)" }));
    });
    /* Highlighted lowest point */
    const lowK = vals.indexOf(min), lx = X(lowK), ly = Y(min);
    const firstNeg = vals.findIndex((v) => v < 0);
    const tipLabel = (min < 0 ? "Below zero " : "Lowest ") + m0(min) + " · " + shortDay(lowK);
    const tw = Math.max(120, tipLabel.length * 7.2 + 20), tx0 = Math.min(W - r - tw, Math.max(l, lx - tw / 2));
    const tipText = s("text", { x: (tx0 + tw / 2).toFixed(1), y: (ly - 24).toFixed(1), "text-anchor": "middle", class: "tip-t", fill: "var(--bg)" }); tipText.textContent = tipLabel;
    const low = [
      s("line", { x1: lx.toFixed(1), x2: lx.toFixed(1), y1: ly.toFixed(1), y2: (H - b).toFixed(1), stroke: "var(--ink)", "stroke-opacity": "0.3", "stroke-dasharray": "3 3" }),
      s("rect", { x: tx0.toFixed(1), y: (ly - 42).toFixed(1), width: tw.toFixed(1), height: 26, rx: 13, fill: "var(--ink)" }), tipText,
      s("circle", { cx: lx.toFixed(1), cy: ly.toFixed(1), r: "7", fill: "var(--bg)", stroke: min < 0 ? "var(--bad)" : "var(--ink)", "stroke-width": "3" })];
    const cross = s("line", { x1: 0, x2: 0, y1: t, y2: H - b, stroke: "var(--ink)", "stroke-opacity": "0.35", visibility: "hidden" });
    const dot = s("circle", { r: "6", fill: "var(--acc)", stroke: "var(--bg)", "stroke-width": "2", visibility: "hidden" });
    const hit = s("rect", { x: l, y: 0, width: W - l - r, height: H, fill: "transparent" });
    const desc = firstNeg >= 0 ? "Balance goes below zero on " + monthDay(firstNeg) + "." : "Lowest point " + m0(min) + " on " + monthDay(lowK) + ".";
    const svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Balance forecast for the next " + R + " days. " + desc },
      s("defs", {},
        s("linearGradient", { id: id + "f", x1: 0, y1: 0, x2: 0, y2: 1 }, s("stop", { offset: "0", "stop-color": "var(--c-blue)", "stop-opacity": "0.42" }), s("stop", { offset: "1", "stop-color": "var(--c-blue)", "stop-opacity": "0" })),
        s("linearGradient", { id: id + "s", x1: 0, y1: 0, x2: 1, y2: 0 }, s("stop", { offset: "0", "stop-color": "var(--c-violet)" }), s("stop", { offset: "1", "stop-color": "var(--c-blue)" })),
        s("clipPath", { id: id + "a" }, s("rect", { x: 0, y: 0, width: W, height: Math.max(0, y0).toFixed(1) })),
        s("clipPath", { id: id + "b" }, s("rect", { x: 0, y: y0.toFixed(1), width: W, height: H }))),
      g,
      s("path", { d: area, fill: "url(#" + id + "f)", "clip-path": "url(#" + id + "a)" }),
      s("path", { d: area, fill: "var(--bad)", "fill-opacity": "0.18", "clip-path": "url(#" + id + "b)" }),
      lo < 0 ? s("line", { x1: l, x2: W - r, y1: y0.toFixed(1), y2: y0.toFixed(1), stroke: "var(--muted)", "stroke-dasharray": "4 4" }) : null,
      s("path", { d: line, fill: "none", stroke: "url(#" + id + "s)", "stroke-width": "3.5", "stroke-linecap": "round", "clip-path": "url(#" + id + "a)" }),
      s("path", { d: line, fill: "none", stroke: "var(--bad)", "stroke-width": "3.5", "stroke-linecap": "round", "clip-path": "url(#" + id + "b)" }),
      marks, low, cross, dot, hit);
    const tip = h("div", { class: "chart-tip", hidden: true });
    const wrap = h("div", { class: "chart" }, svg, tip);
    const show = (ev) => {
      const rect = svg.getBoundingClientRect(), scale = rect.width / W;
      let k = Math.round(((ev.clientX - rect.left) / scale - l) / (W - l - r) * R);
      k = Math.max(0, Math.min(R, k));
      const px = X(k), py = Y(vals[k]);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", px); dot.setAttribute("cy", py); dot.setAttribute("visibility", "visible");
      tip.replaceChildren(h("b", { text: shortDay(k) }), h("div", { text: "Balance " + m0(vals[k]) }),
        pts[k].events.map((e) => h("div", { text: (e.type === "in" ? "+" : MINUS) + m0(e.amount) + " " + e.name })));
      tip.hidden = false;
      const tw2 = tip.offsetWidth, cx = px * scale;
      tip.style.left = Math.max(0, Math.min(rect.width - tw2, cx + 12 + tw2 > rect.width ? cx - tw2 - 12 : cx + 12)) + "px";
      tip.style.top = Math.max(0, py * scale - 30) + "px";
    };
    const hide = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); };
    hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show); hit.addEventListener("pointerleave", hide);
    return { el: wrap, min: min, minDay: lowK, firstNeg: firstNeg };
  }

  /* ---------- Views ---------- */
  function pageHead(id, title, sub, extra) {
    return h("header", { class: "pagehead" },
      h("div", { class: "who" }, mark(), h("div", null, sub ? h("p", { class: "k", text: sub }) : null, h("h1", { id: id, text: title }))),
      extra || null);
  }

  let animateHome = true;
  function renderHome() {
    const A = analysis(), sm = A.summary(), ins = A.insights();
    const hr = new Date().getHours();
    const hello = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    const r = sm.runway, rText = r === Infinity ? "365+" : String(r);
    const st = sm.status;
    const checkinDue = daysSince(S.lastCheckin) >= 7;

    /* Header */
    const bell = h("button", { class: "round", type: "button", "aria-label": checkinDue ? "Weekly check in is ready" : "Weekly check in", onclick: () => { const c = document.getElementById("checkin"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); else toast("Your next check in is in " + plural(Math.max(1, 7 - daysSince(S.lastCheckin)), "day") + "."); } },
      icon("i-bell"), checkinDue ? h("span", { class: "dot", "aria-hidden": "true" }) : null);
    const head = h("header", { class: "pagehead" },
      h("div", { class: "who" }, mark(), h("div", null, h("p", { class: "k", text: hello }), h("h1", { id: "home-title", text: fmtDate(today(), { weekday: "long", month: "short", day: "numeric" }) }))),
      h("div", { class: "btn-row" }, S.sample ? h("span", { class: "chip", text: "Sample" }) : null, bell));

    /* Hero: safe to spend */
    const winEnd = sm.safeWindow;
    const horizon = A.paydays.length >= 2 && winEnd === A.paydays[1] ? "Each day until payday on " + monthDay(winEnd) : "Each day for the next " + winEnd + " days";
    let sub;
    if (sm.short) sub = "You are " + m0(sm.short.amount) + " short before your next payday. Hold off on extras.";
    else if (sm.safeToday <= 0 && sm.spentToday > 0) sub = "You have spent " + m0(sm.spentToday) + " today, which uses up today's safe amount.";
    else sub = horizon + (S.buffer > 0 ? ", with your " + m0(S.buffer) + " cushion kept aside." : ".") + (sm.spentToday > 0 ? " Already counts the " + m0(sm.spentToday) + " you logged today." : "");
    const whole = Math.floor(sm.safeToday), cents = Math.round((sm.safeToday - whole) * 100);
    const hero = h("section", { class: "hero", "aria-labelledby": "sf-l" },
      h("p", { class: "lbl", id: "sf-l", text: "Safe to spend today" }),
      h("p", { class: "big" }, fm0.format(whole), h("span", { class: "cents", text: "." + String(cents).padStart(2, "0") })),
      h("p", { class: "sub", text: sub }),
      h("div", { class: "pills" },
        h("button", { class: "pillbtn on", type: "button", text: "Log", onclick: () => logPurchaseSheet() }),
        h("button", { class: "pillbtn", type: "button", text: "Afford?", "aria-label": "Can I afford this?", onclick: affordSheet }),
        h("button", { class: "pillbtn", type: "button", text: "Balance", "aria-label": "Update balance", onclick: balanceSheet })));

    /* Tiles. Colors keep fixed meanings: violet runway, mint income, blue low point, teal bills. */
    const pct = Math.min(r === Infinity ? 90 : r, 90) / 90 * 100;
    const fill = h("i");
    const numEl = h("span", { text: rText });
    const runOut = r === Infinity ? "Your money lasts more than a year" : r === 0 ? "Your money does not cover today" : "Your money lasts until " + monthDay(r);
    const nextPay = sm.nextPayday !== null ? A.events[sm.nextPayday].filter((e) => e.type === "in").reduce((a, e) => a + e.amount, 0) : 0;
    const billsM = S.bills.reduce((a, x) => a + E.monthlyOf(x), 0);
    let nextBill = null;
    for (let k = 0; k <= 60 && !nextBill; k++) { const e = A.events[k].find((x) => x.type === "out"); if (e) nextBill = { k: k, e: e }; }
    const tiles = h("section", { "aria-labelledby": "rw-l" },
      h("div", { class: "sec-h" }, h("h2", { id: "rw-l", text: "Your runway" }), h("span", { class: "aside", text: "Next 90 days" })),
      h("div", { class: "tiles" },
        h("div", { class: "tile violet wide" },
          h("div", { class: "row" }, h("span", { class: "ic" }, icon("i-sun")), h("span", { class: "status " + st.key, text: st.label })),
          h("div", null,
            h("p", { class: "v" }, numEl, h("small", { text: r === 1 ? "day" : "days" })),
            h("p", { class: "k", text: runOut }),
            h("div", { class: "bar", role: "img", "aria-label": "Runway " + rText + " days on a 90 day scale" }, fill))),
        h("a", { class: "tile mint", href: "#plan", "aria-label": sm.nextPayday !== null ? "Next payday " + monthDay(sm.nextPayday) + ", plus " + m0(nextPay) + ". Open Plan" : "No payday added. Open Plan to add income" },
          h("span", { class: "ic" }, icon("i-cal")),
          h("div", null, h("p", { class: "v", text: sm.nextPayday !== null ? shortDay(sm.nextPayday) : "Add" }), h("p", { class: "k", text: sm.nextPayday !== null ? "Payday, +" + m0(nextPay) : "Add your paycheck" }))),
        h("div", { class: "tile blue" },
          h("span", { class: "ic" }, icon("i-low")),
          h("div", null, h("p", { class: "v", text: m0(ins.lowest30.amount) }), h("p", { class: "k", text: (ins.lowest30.amount < 0 ? "Below zero, " : "Lowest, ") + shortDay(ins.lowest30.day) }))),
        h("a", { class: "tile teal wide", href: "#plan", "aria-label": "Bills, " + m0(billsM) + " a month. Open Plan" },
          h("div", { class: "row" }, h("span", { class: "ic" }, icon("i-bill")), ins.billShare !== null && billsM > 0 ? h("span", { class: "k", text: Math.round(ins.billShare * 100) + "% of income" }) : null),
          h("div", null, h("p", { class: "v" }, m0(billsM), h("small", { text: "a month" })),
            h("p", { class: "k", text: nextBill ? "Bills. Next is " + nextBill.e.name + " on " + monthDay(nextBill.k) : "No bills yet. Add them in Plan" })))));

    /* Weekly check in */
    let checkin = null;
    if (checkinDue) {
      const w = weekStats(), diff = S.daily - w.avg;
      const msg = w.count === 0
        ? "You have not logged any purchases this week. Update your balance so your numbers stay true."
        : "You logged " + m0(w.total) + " over the last 7 days, about " + m0(w.avg) + " a day. That is " + m0(Math.abs(diff)) + " a day " + (diff >= 0 ? "under" : "over") + " your plan.";
      checkin = h("section", { class: "glass iconrow", id: "checkin", "aria-labelledby": "ci-l" },
        h("span", { class: "circle teal" }, icon("i-check")),
        h("div", null, h("h2", { id: "ci-l", text: "Weekly check in" }), h("p", { text: msg }),
          h("div", { class: "btn-row" },
            h("button", { class: "btn primary small", type: "button", text: "Update balance", onclick: balanceSheet }),
            w.days >= 3 ? h("button", { class: "btn small", type: "button", text: "Use " + m0(w.avg) + " a day", onclick: () => { S.daily = Math.round(w.avg); commit(); toast("Daily spending set to " + m0(S.daily)); } }) : null,
            h("button", { class: "btn quiet small", type: "button", text: "Done", onclick: checkinDone }))));
    }

    /* What to know */
    const tips = [];
    if (sm.short) tips.push({ cls: "bad", t: "You are about " + m0(sm.short.amount) + " short before payday, starting " + longDay(sm.short.day) + ". Move a bill, trim daily spending, or add money." });
    if (ins.fiveLessGain > 0) tips.push({ cls: "", t: "Spending $5 less a day adds " + (ins.fiveLessReachesYear ? "more than " : "") + plural(ins.fiveLessGain, "day") + " to your runway." });
    if (r !== Infinity && r < 90) tips.push(ins.dailyCapFor90 === null ? { cls: "bad", t: "Even at $0 a day your bills outrun your income within 90 days. Review your bills in Plan." } : { cls: "warn", t: "To last 90 days, spend up to " + m0(ins.dailyCapFor90) + " a day." });
    else if (ins.dailyCapFor90 !== null) tips.push({ cls: "", t: "You could spend up to " + m0(ins.dailyCapFor90) + " a day and still last 90 days." });
    if (!S.incomes.length) tips.push({ cls: "warn", t: "Add your paycheck in Plan so the forecast can see paydays." });
    const tipsCard = tips.length ? h("section", { class: "glass", "aria-labelledby": "tp-l" },
      h("div", { class: "sec-h" }, h("h2", { id: "tp-l", text: "What to know" })),
      h("ul", { class: "tips" }, tips.slice(0, 3).map((x) => h("li", { class: x.cls, text: x.t })))) : null;

    /* Forecast */
    const R = S.settings.range;
    const c = chart(A, R);
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Forecast range" },
      [30, 90, 180].map((d) => h("button", { type: "button", "aria-pressed": String(d === R), "aria-label": d + " days", text: d + "d", onclick: () => { S.settings.range = d; commit(); } })));
    const fc = h("section", { class: "glass", "aria-labelledby": "fc-l" },
      h("div", { class: "sec-h" }, h("h2", { id: "fc-l", text: "Balance ahead" }), seg),
      c.el,
      h("div", { class: "legend" }, h("span", null, h("i", { class: "in" }), "Payday"), h("span", null, h("i", { class: "out" }), "Bill"), c.firstNeg >= 0 ? h("span", null, h("i", { class: "neg" }), "Below zero from " + monthDay(c.firstNeg)) : null));

    /* Coming up */
    const up = [];
    for (let k = 0; k <= 30 && up.length < 5; k++) A.events[k].forEach((e) => { if (up.length < 5) up.push({ k: k, e: e }); });
    const upCard = h("section", { class: "glass", "aria-labelledby": "up-l" },
      h("div", { class: "sec-h" }, h("h2", { id: "up-l", text: "Coming up" }), h("a", { class: "btn quiet small", href: "#plan", text: "See plan" })),
      up.length ? h("ul", { class: "list" }, up.map((u) => {
        const after = A.balanceAt(u.k);
        return h("li", null, h("div", { class: "item" },
          h("span", { class: "circle " + (u.e.type === "in" ? "mint" : "teal") }, icon(u.e.type === "in" ? "i-in" : "i-bill")),
          h("span", null, h("span", { class: "nm", text: u.e.name }), h("span", { class: "sub", text: shortDay(u.k) + " · " + FREQ_LABEL[u.e.freq] })),
          h("span", { class: "amt " + u.e.type }, (u.e.type === "in" ? "+" : MINUS) + m0(u.e.amount), h("span", { class: "after", text: after < 0 ? "below zero after" : m0(after) + " after" }))));
      })) : h("p", { class: "empty", text: "Nothing in the next 30 days. Add your paycheck and bills in Plan." }));

    $("#view-home").replaceChildren(head,
      h("div", { class: "lay" },
        h("div", { class: "l" }, hero, tiles),
        h("div", { class: "r" }, checkin, fc, upCard, tipsCard)));

    /* Motion: count up and fill, once per visit */
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animateHome || reduce || r === Infinity || r === 0) { fill.style.width = pct + "%"; return; }
    animateHome = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct + "%"; }));
    let t0 = null;
    const stepFn = (ts) => { if (t0 === null) t0 = ts; const p = Math.min(1, (ts - t0) / 1000); numEl.textContent = String(Math.round(r * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(stepFn); };
    requestAnimationFrame(stepFn);
  }

  function itemList(kind) {
    const list = kind === "income" ? S.incomes : S.bills, t = today();
    if (!list.length) return h("p", { class: "empty", text: kind === "income" ? "No income yet. Add your paycheck so TUSI knows when money arrives." : "No bills yet. Add rent, phone, insurance and subscriptions." });
    const rows = list.map((it) => ({ it: it, k: E.occurrences(it, t)[0] }))
      .sort((a, b) => (a.k === undefined ? 1e9 : a.k) - (b.k === undefined ? 1e9 : b.k));
    return h("ul", { class: "list" }, rows.map(({ it, k }) => h("li", null,
      h("button", { class: "item", type: "button", "aria-label": "Edit " + (it.name || "item") + ", " + m2(it.amount) + ", " + FREQ_LABEL[it.freq], onclick: () => itemSheet(kind, it) },
        h("span", { class: "circle " + (kind === "income" ? "mint" : "teal") }, icon(kind === "income" ? "i-in" : "i-bill")),
        h("span", null, h("span", { class: "nm", text: it.name }), h("span", { class: "sub", text: FREQ_LABEL[it.freq] + (k === undefined ? ", already passed" : k === 0 ? ", today" : ", next " + fmtDate(dayOff(k), { month: "short", day: "numeric" })) })),
        h("span", { class: "amt " + (kind === "income" ? "in" : "") }, (kind === "income" ? "+" : "") + m2(it.amount))))));
  }

  function renderPlan() {
    const monthly = (list) => list.reduce((a, x) => a + E.monthlyOf(x), 0);
    const upd = daysSince(S.balanceUpdated);
    const updText = upd === 0 ? "Updated today" : upd === 1 ? "Updated yesterday" : "Updated " + upd + " days ago";
    const row = (k, sub, v, onclick) => h("button", { class: "linkrow", type: "button", onclick: onclick },
      h("span", null, k, h("span", { class: "sub", text: sub })),
      h("span", { class: "rowline-v" }, h("span", { class: "v", text: v })));
    $("#view-plan").replaceChildren(
      pageHead("plan-title", "Plan", "Your numbers, money coming in, and bills"),
      h("div", { class: "grid2" },
        h("section", { class: "card span", "aria-labelledby": "en-l" },
          h("div", { class: "sec-h" }, h("h2", { id: "en-l", text: "Everyday numbers" })),
          row("Balance", updText, m2(S.balance), balanceSheet),
          row("Daily spending", "Food, gas and fun, per day", m0(S.daily), () => numberSheet("daily")),
          row("Cushion", "Kept aside, never counted as safe", m0(S.buffer), () => numberSheet("buffer"))),
        h("section", { class: "card", "aria-labelledby": "in-l" },
          h("div", { class: "sec-h" }, h("h2", { id: "in-l", text: "Money coming in" }), h("span", { class: "aside", text: "About " + m0(monthly(S.incomes)) + " a month" })),
          itemList("income"),
          h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", onclick: () => itemSheet("income") }, icon("i-plus"), "Add income"))),
        h("section", { class: "card", "aria-labelledby": "bl-l" },
          h("div", { class: "sec-h" }, h("h2", { id: "bl-l", text: "Bills" }), h("span", { class: "aside", text: "About " + m0(monthly(S.bills)) + " a month" })),
          itemList("bill"),
          h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", onclick: () => itemSheet("bill") }, icon("i-plus"), "Add bill")))));
  }

  function renderLog() {
    const w = weekStats(), t = E.iso(today()), yest = E.iso(dayOff(-1));
    const groups = [];
    S.log.forEach((x) => { let g = groups.find((y) => y.date === x.date); if (!g) groups.push(g = { date: x.date, items: [] }); g.items.push(x); });
    groups.sort((a, b) => (a.date < b.date ? 1 : -1));
    const label = (d) => (d === t ? "Today" : d === yest ? "Yesterday" : fmtDate(E.parseDate(d), { weekday: "long", month: "short", day: "numeric" }));
    $("#view-log").replaceChildren(
      pageHead("log-title", "Log", "Purchases you logged. Each one lowers your balance."),
      h("div", { class: "grid2" },
        h("section", { class: "card", "aria-labelledby": "wk-l" },
          h("div", { class: "sec-h" }, h("h2", { id: "wk-l", text: "Last 7 days" })),
          h("div", { class: "big-n", text: m0(w.total) }),
          h("p", { class: "lead", text: w.count ? "About " + m0(w.avg) + " a day across " + plural(w.count, "purchase") + ". Your plan is " + m0(S.daily) + " a day." : "Nothing logged this week yet." }),
          w.days >= 3 ? h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", text: "Use " + m0(w.avg) + " a day as my plan", onclick: () => { S.daily = Math.round(w.avg); commit(); toast("Daily spending set to " + m0(S.daily)); } })) : h("p", { class: "hint muted", text: "Log on 3 or more days and TUSI can suggest your real daily average." })),
        h("section", { class: "card iconrow" },
          h("span", { class: "circle teal" }, icon("i-plus")),
          h("div", null, h("h2", { text: "Log as you go" }), h("p", { text: "Tap the plus button after each purchase. It takes a few seconds and keeps safe to spend honest." }),
            h("div", { class: "btn-row" }, h("button", { class: "btn primary small", type: "button", text: "Log a purchase", onclick: () => logPurchaseSheet() })))),
        h("section", { class: "card span", "aria-labelledby": "hs-l" },
          h("div", { class: "sec-h" }, h("h2", { id: "hs-l", text: "History" })),
          groups.length ? groups.slice(0, 60).map((g) => h("div", null,
            h("p", { class: "group-label", text: label(g.date) + ", " + m2(g.items.reduce((a, x) => a + x.amt, 0)) }),
            h("ul", { class: "list" }, g.items.map((x) => h("li", null, h("div", { class: "rowline" },
              h("span", { class: "k", text: x.note || "Purchase" }),
              h("span", { class: "btn-row" }, h("span", { class: "v", text: MINUS + m2(x.amt) }),
                h("button", { class: "btn quiet small", type: "button", "aria-label": "Remove " + (x.note || "purchase") + " " + m2(x.amt), text: "Remove", onclick: () => removeLog(x.id) }))))))))
            : h("p", { class: "empty", text: "No purchases yet. Your first one will show up here." }))));
  }

  function renderMore() {
    const backend = Store.backend();
    const where = backend === "indexeddb" ? "Saved in this browser's database on this device." : backend === "localstorage" ? "Saved in this browser's storage on this device." : "Saving is off in this browser mode. Numbers last until you close the tab.";
    const themeSeg = h("div", { class: "seg", role: "group", "aria-label": "Theme" },
      [["system", "Match device"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => h("button", { type: "button", "aria-pressed": String(S.settings.theme === v), text: l, onclick: () => { S.settings.theme = v; applyTheme(); commit(); } })));
    const eraseBox = h("div", { class: "result", hidden: true },
      h("p", { text: "This deletes every number, bill and purchase on this device. It cannot be undone." }),
      h("div", { class: "btn-row" },
        h("button", { class: "btn danger", type: "button", text: "Erase everything", onclick: eraseAll }),
        h("button", { class: "btn", type: "button", text: "Keep my data", onclick: () => { eraseBox.hidden = true; } })));
    $("#view-more").replaceChildren(
      pageHead("more-title", "More", "Settings, your data, and about TUSI"),
      h("div", { class: "grid2" },
        installCard(),
        h("section", { class: "card", "aria-labelledby": "ap-l" },
          h("div", { class: "sec-h" }, h("h2", { id: "ap-l", text: "Appearance" })), themeSeg),
        h("section", { class: "card", "aria-labelledby": "dt-l" },
          h("div", { class: "sec-h" }, h("h2", { id: "dt-l", text: "Your data" })),
          h("p", { class: "muted", text: where + " Nothing is sent anywhere." }),
          h("p", { class: "hint muted", text: backupNote() }),
          h("div", { class: "btn-row" },
            h("button", { class: "btn primary small", type: "button", text: "Save a backup", onclick: saveBackup }),
            h("button", { class: "btn small", type: "button", text: "Restore from a backup", onclick: pickBackup })),
          h("div", { class: "btn-row", style: null },
            S.sample ? h("button", { class: "btn primary small", type: "button", text: "Clear sample data and set up", onclick: eraseAll }) : null,
            h("button", { class: "btn danger small", type: "button", text: "Erase all data", onclick: () => { eraseBox.hidden = false; } })),
          eraseBox),
        h("section", { class: "card span about-card", id: "about", "aria-labelledby": "ab-l" },
          h("div", { class: "about-hero" }, mark(), h("h2", { id: "ab-l", text: "TUSI" }), h("p", { class: "tag", text: "Built for the ones we plan for." })),
          h("div", { class: "dedication" },
            h("p", { text: "For Deborah, who we call Tusi. Every plan in here is made with the people we love in mind, so the money lasts for the days that matter." }),
            h("span", { class: "sig", text: "With love, Natu" })),
          h("p", { class: "lead", text: "TUSI shows how many days your money lasts and what is safe to spend today. It has no accounts, no bank links and no tracking. Your numbers stay on this device." }),
          h("p", { class: "lead", text: "Forecasts are estimates, not financial advice. Version " + APP_VERSION + "." }))));
  }

  async function eraseAll() {
    await Store.clear();
    S = blankState(); applyTheme(); animateHome = true;
    location.hash = "#home"; render();
    toast("All data erased from this device");
  }

  /* ---------- First run setup ---------- */
  let setup = { step: 1, balance: "", daily: "", payAmt: "", payFreq: "biweekly", payNext: "" };
  function renderSetup() {
    const v = $("#view-setup");
    v.classList.add("setup-mode");
    const steps = h("div", { class: "steps", "aria-hidden": "true" }, [1, 2, 3].map((n) => h("i", { class: n <= setup.step ? "on" : "" })));
    const brand = h("div", { class: "setup-brand" }, mark(), h("div", null, h("b", { text: "TUSI" }), h("span", { text: "Built for the ones we plan for." })));
    const progress = h("p", { class: "group-label", text: "Step " + setup.step + " of 3" });
    let form;
    if (setup.step === 1) {
      form = h("form", { class: "form", novalidate: true },
        h("h1", { class: "setup-q", id: "setup-title", text: "How much money do you have right now?" }),
        moneyField("su-bal", "Your balance", setup.balance, { big: true, hint: "The total in the account you spend from. You can change it any time." }),
        h("button", { class: "btn primary wide-btn", type: "submit", text: "Next" }),
        h("button", { class: "btn quiet", type: "button", text: "Explore with sample data instead", onclick: () => { S = sampleState(); location.hash = "#home"; commit(); toast("Sample data loaded. Clear it any time in More."); } }));
      form.addEventListener("submit", (e) => { e.preventDefault(); const b = readMoney("su-bal", { allowNegative: true }); if (b === null) return; setup.balance = b; setup.step = 2; renderSetup(); });
    } else if (setup.step === 2) {
      const chips = h("div", { class: "btn-row" }, [20, 30, 50].map((n) => h("button", { class: "btn small", type: "button", text: "$" + n, onclick: () => { document.getElementById("su-daily").value = n; } })));
      form = h("form", { class: "form", novalidate: true },
        h("h1", { class: "setup-q", id: "setup-title", text: "What do you usually spend in a day?" }),
        moneyField("su-daily", "Daily spending", setup.daily, { big: true, hint: "Food, gas, coffee, fun. Not bills. A rough guess is fine." }),
        chips,
        h("div", { class: "two" },
          h("button", { class: "btn", type: "button", text: "Back", onclick: () => { setup.step = 1; renderSetup(); } }),
          h("button", { class: "btn primary", type: "submit", text: "Next" })));
      form.addEventListener("submit", (e) => { e.preventDefault(); const d = readMoney("su-daily", { allowEmpty: false }); if (d === null) return; setup.daily = d; setup.step = 3; renderSetup(); });
    } else {
      const defNext = setup.payNext || E.iso(dayOff(7));
      form = h("form", { class: "form", novalidate: true },
        h("h1", { class: "setup-q", id: "setup-title", text: "When is your next paycheck?" }),
        moneyField("su-pay", "Amount after taxes", setup.payAmt),
        h("div", { class: "two" },
          freqField("su-freq", setup.payFreq),
          h("div", { class: "field" }, h("label", { for: "su-next", text: "Next payday" }), h("input", { class: "input", id: "su-next", type: "date", value: defNext }), h("p", { class: "err", id: "su-next-err" }))),
        h("div", { class: "two" },
          h("button", { class: "btn", type: "button", text: "Back", onclick: () => { setup.step = 2; renderSetup(); } }),
          h("button", { class: "btn primary", type: "submit", text: "Finish" })),
        h("button", { class: "btn quiet", type: "button", text: "Skip, I will add income later", onclick: () => finishSetup(null) }));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const a = readMoney("su-pay", { positive: true }); const next = document.getElementById("su-next").value;
        const ok = !!E.parseDate(next); setErr("su-next", ok ? "" : "Pick a date");
        if (a === null || !ok) return;
        finishSetup({ id: uid(), name: "Paycheck", amount: a, freq: document.getElementById("su-freq").value, next: next });
      });
    }
    v.replaceChildren(brand, steps, progress, h("section", { class: "card glass" }, form),
      h("p", { class: "hint muted", text: "Your numbers stay on this device. TUSI has no accounts and sends nothing anywhere." }));
    const first = v.querySelector("input"); if (first) setTimeout(() => first.focus(), 30);
  }
  function finishSetup(pay) {
    S = Object.assign(blankState(), { setupDone: true, balance: Number(setup.balance) || 0, daily: Number(setup.daily) || 0, settings: S.settings });
    if (pay) S.incomes.push(pay);
    setup = { step: 1, balance: "", daily: "", payAmt: "", payFreq: "biweekly", payNext: "" };
    Store.persist();
    location.hash = "#home"; commit();
    toast("You are set. Add your bills in Plan.", "Open Plan", () => { location.hash = "#plan"; });
  }

  /* ---------- Router ---------- */
  const VIEWS = ["home", "plan", "log", "more"];
  let current = null;
  function route() {
    const want = (location.hash || "#home").slice(1);
    return !S.setupDone ? "setup" : want === "about" ? "more" : VIEWS.includes(want) ? want : "home";
  }
  function render() {
    const v = route(), changed = v !== current;
    document.getElementById("app").classList.toggle("no-chrome", v === "setup");
    document.querySelectorAll("[data-view]").forEach((el) => { el.hidden = el.dataset.view !== v; });
    document.querySelectorAll("[data-nav]").forEach((el) => { if (el.dataset.nav === v) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current"); });
    if (v === "home") renderHome(); else if (v === "plan") renderPlan(); else if (v === "log") renderLog(); else if (v === "more") renderMore(); else if (changed) renderSetup();
    document.title = v === "setup" ? "Set up TUSI" : v === "home" ? "TUSI" : v.charAt(0).toUpperCase() + v.slice(1) + " · TUSI";
    if (changed && current !== null) {
      window.scrollTo(0, 0);
      const hd = document.querySelector('[data-view="' + v + '"] h1');
      if (hd) { hd.setAttribute("tabindex", "-1"); hd.focus({ preventScroll: true }); }
    }
    if (location.hash === "#about" && changed) { const a = document.getElementById("about"); if (a) a.scrollIntoView(); }
    current = v;
  }

  /* ---------- Start ---------- */
  async function start() {
    setupSheetEvents();
    setupInstall();
    if (window.matchMedia) { const mq = window.matchMedia("(prefers-color-scheme: dark)"); const f = () => { if (S && S.settings.theme === "system") applyTheme(); }; if (mq.addEventListener) mq.addEventListener("change", f); }
    document.querySelectorAll('[data-action="log-purchase"]').forEach((b) => b.addEventListener("click", () => logPurchaseSheet()));
    window.addEventListener("hashchange", render);
    let rz = null, lastW = window.innerWidth;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 30 && current === "home" && !sheet().open) { lastW = window.innerWidth; renderHome(); } }, 200); });
    let lastDay = E.iso(today());
    document.addEventListener("visibilitychange", () => { if (!document.hidden && E.iso(today()) !== lastDay) { lastDay = E.iso(today()); render(); } });
    let saved = null;
    try { saved = await Store.init(); } catch (e) { saved = null; }
    S = normalize(saved);
    applyTheme();
    if (Store.backend() === "memory") {
      const b = $("#storage-banner"); b.textContent = "Saving is off in this browser mode, so your numbers will be gone when you close this tab. Open TUSI in a normal window to keep them."; b.hidden = false;
    }
    render();
  }
  start();
})();
