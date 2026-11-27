/*
 * TUSI backup files.
 * make() turns the saved state into a plain JSON backup.
 * check() reads a backup file strictly: anything that is not a TUSI backup,
 * or has a value of the wrong kind, is refused with a plain message.
 * Nothing here touches the network or the page.
 */
(function (root, factory) {
  var api = factory(typeof module === "object" && module.exports ? require("./engine.js") : root.TusiEngine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TusiBackup = api;
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  var FORMAT = 1;
  var MAX_BYTES = 1024 * 1024;
  var MAX_AMOUNT = 10000000;
  var LIMITS = { incomes: 100, bills: 200, log: 500 };
  var KINDS = ["income", "pay", "bill"];
  var BAD_KEYS = { "__proto__": 1, "constructor": 1, "prototype": 1 };

  function make(state, meta) {
    meta = meta || {};
    var s = state || {};
    var pickItem = function (it) { return { id: it.id, name: it.name, amount: it.amount, freq: it.freq, next: it.next, appliedOn: it.appliedOn }; };
    return {
      app: "TUSI",
      kind: "backup",
      format: FORMAT,
      exported: meta.now ? new Date(meta.now).toISOString() : new Date().toISOString(),
      appVersion: meta.appVersion || "",
      data: {
        balance: s.balance, daily: s.daily, buffer: s.buffer,
        balanceUpdated: s.balanceUpdated, lastCheckin: s.lastCheckin, setupDate: s.setupDate, settledThrough: s.settledThrough,
        incomes: (s.incomes || []).map(pickItem),
        bills: (s.bills || []).map(pickItem),
        log: (s.log || []).map(function (x) { return { id: x.id, date: x.date, t: x.t, amt: x.amt, note: x.note, kind: x.kind }; }),
        settings: { theme: s.settings && s.settings.theme, range: s.settings && s.settings.range }
      }
    };
  }

  function fileName(now) {
    var d = now ? new Date(now) : new Date();
    return "tusi-backup-" + E.iso(d) + ".json";
  }

  function Fail(msg) { this.message = msg; }

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function money(v, label, opts) {
    if (typeof v !== "number" || !isFinite(v)) throw new Fail(label + " is not a number.");
    if (Math.abs(v) > MAX_AMOUNT) throw new Fail(label + " is too large.");
    if (opts && opts.positive && !(v > 0)) throw new Fail(label + " must be above zero.");
    if (opts && opts.notNegative && v < 0) throw new Fail(label + " cannot be below zero.");
    return Math.round(v * 100) / 100;
  }
  function date(v, label, optional) {
    if (v === undefined && optional) return undefined;
    if (typeof v !== "string" || !E.parseDate(v)) throw new Fail(label + " is not a valid date.");
    return v;
  }
  function text(v, label, max) {
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") throw new Fail(label + " is not text.");
    return v.slice(0, max);
  }
  function id(v) { return typeof v === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : undefined; }

  function items(list, kind, word) {
    if (!Array.isArray(list)) throw new Fail("The " + kind + " list is missing.");
    if (list.length > LIMITS[kind]) throw new Fail("The file has more than " + LIMITS[kind] + " " + kind + ".");
    return list.map(function (it, i) {
      var label = word + " " + (i + 1);
      if (!isObj(it)) throw new Fail(label + " is not readable.");
      if (E.FREQS.indexOf(it.freq) < 0) throw new Fail(label + " has an unknown repeat setting.");
      return {
        id: id(it.id),
        name: text(it.name, label + " name", 40),
        amount: money(it.amount, label + " amount", { positive: true }),
        freq: it.freq,
        next: date(it.next, label + " date"),
        appliedOn: date(it.appliedOn, label + " applied date", true)
      };
    });
  }

  /* Reads backup text. Returns { ok: true, data, summary } or { ok: false, error }. */
  function check(textIn) {
    try {
      if (typeof textIn !== "string" || !textIn.length) throw new Fail("The file is empty.");
      if (textIn.length > MAX_BYTES) throw new Fail("The file is too large to be a TUSI backup.");
      var raw;
      try {
        raw = JSON.parse(textIn, function (k, v) { if (BAD_KEYS[k]) throw new Fail("The file has content TUSI does not accept."); return v; });
      } catch (e) {
        if (e instanceof Fail) throw e;
        throw new Fail("This file is not a TUSI backup. It could not be read as JSON.");
      }
      if (!isObj(raw) || raw.app !== "TUSI" || raw.kind !== "backup") throw new Fail("This file is not a TUSI backup.");
      if (typeof raw.format !== "number") throw new Fail("This backup has no format number.");
      if (raw.format > FORMAT) throw new Fail("This backup was made by a newer version of TUSI. Update TUSI and try again.");
      if (raw.format !== FORMAT) throw new Fail("This backup format is not supported.");
      var d = raw.data;
      if (!isObj(d)) throw new Fail("This backup has no data in it.");
      var settings = isObj(d.settings) ? d.settings : {};
      var data = {
        balance: money(d.balance, "Balance"),
        daily: money(d.daily, "Daily spending", { notNegative: true }),
        buffer: money(d.buffer, "Cushion", { notNegative: true }),
        balanceUpdated: date(d.balanceUpdated, "Balance date", true),
        lastCheckin: date(d.lastCheckin, "Check in date", true),
        setupDate: date(d.setupDate, "Setup date", true),
        settledThrough: date(d.settledThrough, "Settled date", true),
        incomes: items(d.incomes, "incomes", "Income"),
        bills: items(d.bills, "bills", "Bill"),
        log: (function () {
          if (!Array.isArray(d.log)) throw new Fail("The purchase list is missing.");
          if (d.log.length > LIMITS.log) throw new Fail("The file has more than " + LIMITS.log + " purchases.");
          return d.log.map(function (x, i) {
            var label = "Purchase " + (i + 1);
            if (!isObj(x)) throw new Fail(label + " is not readable.");
            var t = x.t === undefined ? undefined : x.t;
            if (t !== undefined && (typeof t !== "number" || !isFinite(t))) throw new Fail(label + " has a bad time.");
            if (x.kind !== undefined && KINDS.indexOf(x.kind) < 0) throw new Fail(label + " has an unknown type.");
            return { id: id(x.id), date: date(x.date, label + " date"), t: t, amt: money(x.amt, label + " amount", { positive: true }), note: text(x.note, label + " note", 40), kind: x.kind };
          });
        })(),
        settings: {
          theme: ["system", "light", "dark"].indexOf(settings.theme) >= 0 ? settings.theme : "dark",
          range: [30, 60, 90, 180].indexOf(settings.range) >= 0 ? settings.range : 30
        }
      };
      var exported = typeof raw.exported === "string" && !isNaN(Date.parse(raw.exported)) ? raw.exported : null;
      return {
        ok: true,
        data: data,
        summary: { exported: exported, balance: data.balance, incomes: data.incomes.length, bills: data.bills.length, purchases: data.log.length }
      };
    } catch (e) {
      return { ok: false, error: e instanceof Fail ? e.message : "This file could not be read." };
    }
  }

  return { FORMAT: FORMAT, MAX_BYTES: MAX_BYTES, make: make, check: check, fileName: fileName };
});
