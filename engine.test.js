/*
 * TUSI engine tests.
 * Every expected value below was worked out by hand from the rules, then the
 * engine is checked against it in both modes: "prototype" (original rules)
 * and "tusi" (with the two approved fixes).
 * A second suite runs 500 random budgets through TUSI's prototype mode and the
 * original prototype code and requires identical results.
 */
(function (root, factory) {
  var api = factory(
    typeof module === "object" && module.exports ? require("./engine.js") : root.TusiEngine,
    typeof module === "object" && module.exports ? require("./prototype-reference.js") : root.PrototypeReference
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TusiTests = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (E, REF) {
  "use strict";

  var T0 = "2027-03-10"; /* fixed "today" so results never depend on the real date */
  function at(today, n) { return E.iso(E.addDays(E.parseDate(today), n)); }
  function run(state, mode, today) { return E.analyze(state, { mode: mode, today: today || T0 }); }
  function sum(state, mode, today) { return run(state, mode, today).summary(); }
  function both(v) { return { prototype: v, tusi: v }; }

  var A = { balance: 300, daily: 10, buffer: 0, incomes: [], bills: [] };
  var B = { balance: 500, daily: 20, buffer: 50, incomes: [{ name: "Paycheck", amount: 700, freq: "biweekly", next: at(T0, 5) }], bills: [] };
  var C = { balance: 200, daily: 30, buffer: 0,
    incomes: [{ name: "Paycheck", amount: 1000, freq: "biweekly", next: at(T0, 10) }],
    bills: [{ name: "Rent", amount: 400, freq: "monthly", next: at(T0, 3) }] };
  var D = { balance: 600, daily: 20, buffer: 0,
    incomes: [{ name: "Paycheck", amount: 500, freq: "biweekly", next: at(T0, 4) }],
    bills: [{ name: "Rent", amount: 1200, freq: "monthly", next: at(T0, 6) }] };
  var H1 = { balance: 300, daily: 20, buffer: 0, incomes: [], bills: [],
    log: [{ date: T0, amt: 25 }, { date: at(T0, -1), amt: 40 }] };
  var H2 = { balance: 300, daily: 20, buffer: 0, incomes: [], bills: [], log: [{ date: T0, amt: 5 }] };

  function occ(next, freq, today, count) {
    return E.occurrences({ name: "x", amount: 10, freq: freq, next: next }, today).slice(0, count || 4);
  }

  var CASES = [
    /* ---- Basics ---- */
    { group: "Basics", name: "No income or bills: runway", why: "$300 at $10 a day runs out on day 30", expect: both(30), run: function (m) { return sum(A, m).runway; } },
    { group: "Basics", name: "No income or bills: safe to spend", why: "No payday known, so spread $300 over 30 days", expect: both(10), run: function (m) { return sum(A, m).safeToday; } },
    { group: "Basics", name: "Money lasts more than a year", why: "$10,000 at $10 a day never runs out inside 365 days", expect: both(Infinity), run: function (m) { return sum({ balance: 10000, daily: 10, incomes: [], bills: [] }, m).runway; } },
    { group: "Basics", name: "Cushion larger than balance", why: "Nothing is safe when the cushion is bigger than the money", expect: both(0), run: function (m) { return sum({ balance: 80, daily: 5, buffer: 100, incomes: [], bills: [] }, m).safeToday; } },
    { group: "Basics", name: "Bad items are ignored", why: "Negative amount, zero amount, unknown frequency and Feb 30 are skipped, so the result equals the empty budget", expect: both(30), run: function (m) {
      return sum({ balance: 300, daily: 10, incomes: [{ amount: -50, freq: "weekly", next: T0 }, { amount: 0, freq: "weekly", next: T0 }],
        bills: [{ amount: 40, freq: "daily", next: T0 }, { amount: 40, freq: "monthly", next: "2027-02-30" }] }, m).runway; } },

    /* ---- Paydays ---- */
    { group: "Paydays", name: "Payday covers the gap: runway", why: "$700 every 2 weeks beats $280 of spending, so it never runs out", expect: both(Infinity), run: function (m) { return sum(B, m).runway; } },
    { group: "Paydays", name: "Next payday", why: "First paycheck is 5 days out", expect: both(5), run: function (m) { return sum(B, m).nextPayday; } },
    { group: "Paydays", name: "Payday covers the gap: safe to spend", why: "Prototype: $450 over 5 days = $90. TUSI looks to the second payday (day 19): ($450 + $700) / 19 = $60.53", expect: { prototype: 90, tusi: 60.53 }, run: function (m) { return sum(B, m).safeToday; } },
    { group: "Paydays", name: "Payday today is not the next payday", why: "Money arriving today is already in hand, so the next payday is 14 days out", expect: both(14), run: function (m) {
      return sum({ balance: 100, daily: 10, incomes: [{ amount: 500, freq: "biweekly", next: T0 }], bills: [] }, m).nextPayday; } },

    /* ---- Shortfalls ---- */
    { group: "Shortfalls", name: "Short before payday: runway", why: "Rent of $400 on day 3 takes $200 below zero", expect: both(3), run: function (m) { return sum(C, m).runway; } },
    { group: "Shortfalls", name: "Short before payday: amount", why: "Lowest point before payday is day 9: 200 minus 400 minus 300 = minus $500", expect: both(500), run: function (m) { return sum(C, m).short.amount; } },
    { group: "Shortfalls", name: "Short before payday: first day", why: "Balance first drops below zero on day 3", expect: both(3), run: function (m) { return sum(C, m).short.day; } },
    { group: "Shortfalls", name: "Short before payday: safe to spend", why: "Nothing is safe", expect: both(0), run: function (m) { return sum(C, m).safeToday; } },
    { group: "Shortfalls", name: "Short before payday: status", why: "Red status pill", expect: both("Short before payday"), run: function (m) { return sum(C, m).status.label; } },
    { group: "Shortfalls", name: "Big bill right after payday: safe to spend", why: "Fix 1. Prototype only looks 4 days ahead and says $150. Rent of $1,200 on day 6 is more than the $1,100 available, so TUSI says $0", expect: { prototype: 150, tusi: 0 }, run: function (m) { return sum(D, m).safeToday; } },
    { group: "Shortfalls", name: "Big bill right after payday: runway", why: "Day 6: 600 plus 500 minus 1,200 minus 140 = minus $240", expect: both(6), run: function (m) { return sum(D, m).runway; } },
    { group: "Shortfalls", name: "Big bill right after payday: status", why: "Runway under 30 days", expect: both("Tight"), run: function (m) { return sum(D, m).status.label; } },

    /* ---- Monthly bills on day 29 to 31 ---- */
    { group: "Month ends", name: "Bill on the 31st", why: "Jan 31, Feb 28, Mar 31, Apr 30 (today Jan 28, 2027)", expect: both([3, 31, 62, 92]), run: function () { return occ("2027-01-31", "monthly", "2027-01-28"); } },
    { group: "Month ends", name: "Bill on the 30th", why: "Jan 30, Feb 28, Mar 30, Apr 30", expect: both([2, 31, 61, 92]), run: function () { return occ("2027-01-30", "monthly", "2027-01-28"); } },
    { group: "Month ends", name: "Bill on the 29th", why: "Jan 29, Feb 28, Mar 29, Apr 29", expect: both([1, 31, 60, 91]), run: function () { return occ("2027-01-29", "monthly", "2027-01-28"); } },
    { group: "Month ends", name: "Leap year February", why: "2028 has Feb 29: Jan 30, Feb 29, Mar 30", expect: both([2, 32, 62]), run: function () { return occ("2028-01-30", "monthly", "2028-01-28", 3); } },
    { group: "Month ends", name: "Across the new year", why: "Dec 31, Jan 31, Feb 29 (today Dec 1, 2027)", expect: both([30, 61, 90]), run: function () { return occ("2027-12-31", "monthly", "2027-12-01", 3); } },

    /* ---- One time and repeating items ---- */
    { group: "Items", name: "One time item ahead", why: "Lands once, 10 days out", expect: both([10]), run: function () { return occ("2027-03-20", "once", T0); } },
    { group: "Items", name: "One time item in the past", why: "Already happened, so it is ignored", expect: both([]), run: function () { return occ("2027-03-05", "once", T0); } },
    { group: "Items", name: "One time item past one year", why: "Outside the 365 day forecast", expect: both([]), run: function () { return occ("2028-04-01", "once", T0); } },
    { group: "Items", name: "Weekly item with an old date", why: "Mar 7 rolls forward to Mar 14, 21, 28, Apr 4", expect: both([4, 11, 18, 25]), run: function () { return occ("2027-03-07", "weekly", T0); } },
    { group: "Items", name: "Every 2 weeks, last one 14 days ago", why: "Rolls forward to today, then every 14 days", expect: both([0, 14, 28, 42]), run: function () { return occ("2027-02-24", "biweekly", T0); } },
    { group: "Items", name: "One time item counts in runway", why: "$300, $10 a day, plus a one time $100 on day 10 lasts 40 days", expect: both(40), run: function (m) {
      return sum({ balance: 300, daily: 10, incomes: [{ amount: 100, freq: "once", next: at(T0, 10) }], bills: [] }, m).runway; } },

    /* ---- Logged spending (Fix 2) ---- */
    { group: "Logged today", name: "Spent $25 today: runway", why: "Fix 2. Balance already lost the $25. Prototype also charges a full $20 for today, so day 15. TUSI does not count today twice, so day 16", expect: { prototype: 15, tusi: 16 }, run: function (m) { return sum(H1, m).runway; } },
    { group: "Logged today", name: "Spent $25 today: safe to spend left today", why: "TUSI daily pace is $325 / 30 = $10.83, already passed today, so $0 left today. Prototype ignores the log and says $10", expect: { prototype: 10, tusi: 0 }, run: function (m) { return sum(H1, m).safeToday; } },
    { group: "Logged today", name: "Spent $5 today: safe to spend left today", why: "TUSI pace $305 / 30 = $10.17, minus $5 spent = $5.17 left today", expect: { prototype: 10, tusi: 5.17 }, run: function (m) { return sum(H2, m).safeToday; } },
    { group: "Logged today", name: "Only today's purchases count", why: "Yesterday's $40 is not included", expect: { prototype: 0, tusi: 25 }, run: function (m) { return sum(H1, m).spentToday; } },

    /* ---- Purchase check and insights ---- */
    { group: "Purchase check", name: "$60 in days of spending", why: "$60 / $10 a day", expect: both(6), run: function (m) { return run(A, m).purchase(60).daysOfSpending; } },
    { group: "Purchase check", name: "$60 runway after", why: "$240 at $10 a day lasts to day 24", expect: both(24), run: function (m) { return run(A, m).purchase(60).runwayAfter; } },
    { group: "Purchase check", name: "$60 change in safe to spend", why: "$10 a day drops to $8 a day", expect: both(-2), run: function (m) { return run(A, m).purchase(60).safeChange; } },
    { group: "Purchase check", name: "Purchase that causes a shortfall", why: "$450 on top of case B leaves too little before day 5", expect: both(true), run: function (m) { return run(B, m).purchase(450).makesShort; } },
    { group: "Insights", name: "Daily cap to last 90 days", why: "$900 with no income lasts 90 days at $10 a day", expect: both(10), run: function (m) { return run({ balance: 900, daily: 20, incomes: [], bills: [] }, m).insights().dailyCapFor90; } },
    { group: "Insights", name: "Effect of $5 less per day", why: "$300 at $10 is 30 days; at $5 it is 60 days, so 30 more", expect: both(30), run: function (m) { return run(A, m).insights().fiveLessGain; } },
    { group: "Insights", name: "Bills as a share of income", why: "$1,300 rent / ($1,000 x 26 / 12) = 60%", expect: both(0.6), run: function (m) {
      return run({ balance: 0, daily: 0, incomes: [{ amount: 1000, freq: "biweekly", next: T0 }], bills: [{ amount: 1300, freq: "monthly", next: T0 }] }, m).insights().billShare; } },
    { group: "Insights", name: "Lowest point in 30 days", why: "Case C: the lowest balance in 30 days is day 9, at minus $500, just before payday", expect: both(-500), run: function (m) { return run(C, m).insights().lowest30.amount; } }
  ];

  /* ---------- Comparison ---------- */
  function same(a, b) {
    if (typeof a === "number" && typeof b === "number") {
      if (!isFinite(a) || !isFinite(b)) return a === b;
      return Math.abs(a - b) < 0.01;
    }
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every(function (x, i) { return same(x, b[i]); });
    return a === b;
  }

  function runCases() {
    return CASES.map(function (c) {
      var out = { group: c.group, name: c.name, why: c.why, expect: c.expect, got: {}, pass: true };
      ["prototype", "tusi"].forEach(function (m) {
        var v;
        try { v = c.run(m); } catch (e) { v = "Error: " + e.message; }
        out.got[m] = v;
        if (!same(v, c.expect[m])) out.pass = false;
      });
      out.changed = !same(c.expect.prototype, c.expect.tusi);
      return out;
    });
  }

  /* ---------- Parity with the original prototype on random budgets ---------- */
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

  function randomState(r, today) {
    var freqs = ["weekly", "biweekly", "monthly", "once"];
    function item() {
      return { name: "x", amount: Math.round(r() * 1500) + 1, freq: freqs[Math.floor(r() * 4)], next: at(today, Math.floor(r() * 80) - 20) };
    }
    var s = { balance: Math.round(r() * 4000 - 500), daily: Math.round(r() * 80), buffer: Math.round(r() * 300), incomes: [], bills: [] };
    var ni = Math.floor(r() * 3), nb = Math.floor(r() * 6);
    for (var i = 0; i < ni; i++) s.incomes.push(item());
    for (var j = 0; j < nb; j++) s.bills.push(item());
    return s;
  }

  function runParity(n) {
    n = n || 500;
    var r = rng(20261123), failures = [], todays = ["2027-01-28", "2027-03-10", "2028-02-27", "2027-12-30"];
    for (var i = 0; i < n; i++) {
      var today = todays[i % todays.length], s = randomState(r, today);
      var ref = REF.run(JSON.parse(JSON.stringify(s)), E.parseDate(today));
      var eng = E.analyze(s, { mode: "prototype", today: today });
      var sm = eng.summary(), price = Math.round(r() * 300) + 1, pr = eng.purchase(price), rp = ref.purchase(price);
      var checks = [
        ["runway", sm.runway, ref.runway],
        ["next payday", sm.nextPayday, ref.nextPayday],
        ["safe to spend", sm.safeToday, ref.safe],
        ["short amount", sm.short ? sm.short.amount : null, ref.short ? ref.short.amount : null],
        ["short day", sm.short ? sm.short.day : null, ref.short ? ref.short.day : null],
        ["daily cap 90", eng.insights().dailyCapFor90, ref.cap90],
        ["runway after purchase", pr.runwayAfter, rp.runwayAfter],
        ["safe after purchase", pr.safeAfter, rp.safeAfter]
      ];
      checks.forEach(function (c) {
        if (!same(c[1], c[2])) failures.push({ run: i, today: today, check: c[0], engine: c[1], prototype: c[2] });
      });
    }
    return { runs: n, checksPerRun: 8, failures: failures };
  }

  function runAll() {
    var cases = runCases(), parity = runParity(500);
    return {
      engineVersion: E.VERSION,
      cases: cases,
      passed: cases.filter(function (c) { return c.pass; }).length,
      total: cases.length,
      parity: parity
    };
  }

  return { runAll: runAll, runCases: runCases, runParity: runParity };
});
