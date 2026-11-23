/*
 * TUSI runway engine
 *
 * Pure calculation code. No DOM, no storage, no network.
 * Works as a classic script (sets window.TusiEngine) and in Node (module.exports),
 * so it runs from GitHub Pages, from a double clicked file, and in tests.
 *
 * Two modes:
 *   "prototype"  the original prototype rules, unchanged
 *   "tusi"       the default; adds two fixes Natu approved on 2026-11-23
 *     Fix 1  Safe to spend looks ahead to the second upcoming payday (or 30 days),
 *            so a large bill just after the next payday is counted.
 *     Fix 2  Purchases logged today are not counted twice: today's planned
 *            daily spending is reduced by what was already logged today.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TusiEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HORIZON = 365;
  var MS_PER_DAY = 864e5;
  var FREQS = ["weekly", "biweekly", "monthly", "once"];
  var MONTHLY_FACTOR = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, once: 0 };

  /* ---------- Dates (always local calendar days) ---------- */

  function parseDate(s) {
    if (typeof s !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    var dt = new Date(y, mo, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return dt;
  }
  function toDay(x) {
    var d = x instanceof Date ? x : parseDate(x);
    if (!d || isNaN(d)) d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(day, n) { return new Date(day.getFullYear(), day.getMonth(), day.getDate() + n); }
  /* Math.round absorbs the one hour daylight saving shift */
  function diffDays(from, to) { return Math.round((to - from) / MS_PER_DAY); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  /* ---------- Input cleaning ---------- */

  function num(v, fallback) { var n = Number(v); return isFinite(n) ? n : fallback; }

  function cleanItem(it) {
    if (!it || typeof it !== "object") return null;
    var amount = num(it.amount, 0);
    if (!(amount > 0)) return null;
    if (FREQS.indexOf(it.freq) < 0) return null;
    if (!parseDate(it.next)) return null;
    return { name: typeof it.name === "string" ? it.name : "", amount: amount, freq: it.freq, next: it.next };
  }

  function cleanState(s) {
    s = s || {};
    return {
      balance: num(s.balance, 0),
      daily: Math.max(0, num(s.daily, 0)),
      buffer: Math.max(0, num(s.buffer, 0)),
      incomes: (Array.isArray(s.incomes) ? s.incomes : []).map(cleanItem).filter(Boolean),
      bills: (Array.isArray(s.bills) ? s.bills : []).map(cleanItem).filter(Boolean),
      log: Array.isArray(s.log) ? s.log : []
    };
  }

  /* ---------- Recurrence ---------- */

  /* Day offsets (0 = today) on which an item lands, within the horizon. */
  function occurrences(item, today, horizon) {
    var it = cleanItem(item);
    var out = [];
    if (!it) return out;
    today = toDay(today);
    horizon = horizon == null ? HORIZON : horizon;
    var start = parseDate(it.next);
    var d0 = diffDays(today, start);

    if (it.freq === "once") {
      if (d0 >= 0 && d0 <= horizon) out.push(d0);
      return out;
    }
    if (it.freq === "weekly" || it.freq === "biweekly") {
      var step = it.freq === "weekly" ? 7 : 14, d = d0;
      if (d < 0) d += Math.ceil(-d / step) * step;
      for (; d <= horizon; d += step) out.push(d);
      return out;
    }
    /* Monthly: keep the anchor day, clamp to month length (31st becomes Feb 28 or 29, then back to 31). */
    var anchor = start.getDate();
    for (var m = 0; m < 600; m++) {
      var mo = start.getMonth() + m;
      var yy = start.getFullYear() + Math.floor(mo / 12), mm = ((mo % 12) + 12) % 12;
      var off = diffDays(today, new Date(yy, mm, Math.min(anchor, daysInMonth(yy, mm))));
      if (off > horizon) break;
      if (off >= 0) out.push(off);
    }
    return out;
  }

  function monthlyOf(item) {
    var it = cleanItem(item);
    return it ? it.amount * MONTHLY_FACTOR[it.freq] : 0;
  }

  /* Sum of purchases logged on today's date. Entries: { amt, t (ms) } or { amt, date: "YYYY-MM-DD" }. */
  function spentOn(log, today) {
    var key = iso(today), total = 0;
    (log || []).forEach(function (x) {
      if (!x) return;
      var amt = num(x.amt, 0);
      if (!(amt > 0)) return;
      var d = typeof x.date === "string" ? x.date : (isFinite(x.t) ? iso(new Date(x.t)) : null);
      if (d === key) total += amt;
    });
    return Math.round(total * 100) / 100;
  }

  /* ---------- Analysis ---------- */

  function analyze(rawState, options) {
    options = options || {};
    var mode = options.mode === "prototype" ? "prototype" : "tusi";
    var fixed = mode === "tusi";
    var today = toDay(options.today);
    var H = HORIZON;
    var S = cleanState(rawState);
    var spent = fixed ? spentOn(S.log, today) : 0;

    var inc = new Array(H + 1).fill(0), bil = new Array(H + 1).fill(0), events = [];
    for (var i = 0; i <= H; i++) events.push([]);
    S.incomes.forEach(function (it) {
      occurrences(it, today, H).forEach(function (d) { inc[d] += it.amount; events[d].push({ name: it.name || "Income", amount: it.amount, type: "in", freq: it.freq }); });
    });
    S.bills.forEach(function (it) {
      occurrences(it, today, H).forEach(function (d) { bil[d] += it.amount; events[d].push({ name: it.name || "Bill", amount: it.amount, type: "out", freq: it.freq }); });
    });
    var cum = [], c = 0;
    for (var d = 0; d <= H; d++) { c += inc[d] - bil[d]; cum[d] = c; }

    var paydays = [];
    for (var p = 1; p <= H; p++) if (inc[p] > 0) paydays.push(p);
    var nextPayday = paydays.length ? paydays[0] : null;

    /* Balance at the end of day d. extra = a purchase being considered today. */
    function balanceAt(day, daily, extra) {
      if (daily == null) daily = S.daily;
      var credit = fixed ? Math.min(daily, spent) : 0; /* Fix 2 */
      return S.balance - (extra || 0) + cum[day] - daily * (day + 1) + credit;
    }
    function runwayFor(daily, extra) {
      for (var k = 0; k <= H; k++) if (balanceAt(k, daily, extra) < 0) return k;
      return Infinity;
    }
    function safeWindow() {
      if (!fixed) return nextPayday === null ? 30 : nextPayday;
      if (paydays.length >= 2) return paydays[1];          /* Fix 1 */
      if (paydays.length === 1) return Math.max(paydays[0], 30);
      return 30;
    }
    /* Even daily pace that keeps the balance at or above the cushion every day in the window. */
    function safe(extra) {
      var N = safeWindow(), pace = Infinity, start = S.balance + spent - (extra || 0);
      for (var k = 0; k < N; k++) pace = Math.min(pace, (start + cum[k] - S.buffer) / (k + 1));
      pace = Math.max(0, pace);
      return { pace: pace, today: Math.max(0, pace - spent), window: N };
    }
    function shortBeforePay(extra) {
      var N = nextPayday === null ? 30 : nextPayday, worst = Infinity, first = null;
      for (var k = 0; k < N; k++) {
        var b = balanceAt(k, S.daily, extra);
        if (b < worst) worst = b;
        if (b < 0 && first === null) first = k;
      }
      return worst < 0 ? { amount: -worst, day: first } : null;
    }
    function maxDailyFor(target) {
      if (runwayFor(0) < target) return null;
      /* Prototype searched 0 to 2000 in 30 steps; TUSI widens the range for large balances. */
      var lo = 0, hi = fixed ? Math.max(2000, Math.abs(S.balance) + 1) : 2000;
      for (var n = 0, steps = fixed ? 40 : 30; n < steps; n++) { var mid = (lo + hi) / 2; if (runwayFor(mid) >= target) lo = mid; else hi = mid; }
      return lo;
    }
    function status() {
      var r = runwayFor(S.daily), sf = safe(0);
      if (shortBeforePay(0)) return { key: "bad", label: "Short before payday" };
      if (r !== Infinity && r < 30) return { key: "warn", label: "Tight" };
      if (S.daily > sf.pace + 0.5) return { key: "warn", label: "Tight" };
      return { key: "good", label: "On track" };
    }
    function purchase(price) {
      price = Math.max(0, num(price, 0));
      var s0 = safe(0), s1 = safe(price);
      return {
        price: price,
        daysOfSpending: S.daily > 0 ? price / S.daily : null,
        runwayBefore: runwayFor(S.daily), runwayAfter: runwayFor(S.daily, price),
        safeBefore: s0.today, safeAfter: s1.today, safeChange: s1.today - s0.today,
        alreadyShort: !!shortBeforePay(0), makesShort: !shortBeforePay(0) && !!shortBeforePay(price),
        fitsToday: price <= s0.today
      };
    }
    function insights() {
      var low = Infinity, lowDay = 0;
      for (var k = 0; k <= 30; k++) { var b = balanceAt(k); if (b < low) { low = b; lowDay = k; } }
      var r = runwayFor(S.daily), r5 = S.daily >= 5 ? runwayFor(S.daily - 5) : r;
      var incM = S.incomes.reduce(function (a, x) { return a + monthlyOf(x); }, 0);
      var billM = S.bills.reduce(function (a, x) { return a + monthlyOf(x); }, 0);
      return {
        lowest30: { amount: low, day: lowDay },
        dailyCapFor90: maxDailyFor(90),
        fiveLessGain: r === Infinity ? 0 : (r5 === Infinity ? H : r5) - r,
        fiveLessReachesYear: r !== Infinity && r5 === Infinity,
        billShare: incM > 0 ? billM / incM : null,
        monthlyIncome: incM, monthlyBills: billM
      };
    }
    function forecast(days) {
      days = Math.min(H, Math.max(1, days || 60));
      var out = [];
      for (var k = 0; k <= days; k++) out.push({ day: k, date: iso(addDays(today, k)), balance: balanceAt(k), events: events[k] });
      return out;
    }
    function summary() {
      var sf = safe(0);
      return {
        mode: mode, today: iso(today),
        runway: runwayFor(S.daily), nextPayday: nextPayday,
        safeToday: sf.today, safePace: sf.pace, safeWindow: sf.window,
        spentToday: spent, short: shortBeforePay(0), status: status()
      };
    }

    return {
      mode: mode, today: today, state: S, events: events, paydays: paydays, nextPayday: nextPayday,
      balanceAt: balanceAt, runwayFor: runwayFor, safe: safe, shortBeforePay: shortBeforePay,
      maxDailyFor: maxDailyFor, status: status, purchase: purchase, insights: insights,
      forecast: forecast, summary: summary
    };
  }

  return {
    VERSION: "1.0.0", HORIZON: HORIZON, FREQS: FREQS.slice(),
    parseDate: parseDate, iso: iso, addDays: addDays, diffDays: diffDays,
    occurrences: occurrences, monthlyOf: monthlyOf, spentOn: spentOn,
    cleanState: cleanState, analyze: analyze
  };
});
