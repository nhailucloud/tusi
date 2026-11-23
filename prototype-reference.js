/*
 * Prototype reference: the calculation functions copied from the original
 * single file prototype with no changes to their logic. The only change is the
 * wrapper, which takes the state and "today" as inputs instead of page globals,
 * so the tests can compare TUSI's "prototype" mode against the original code.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PrototypeReference = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function run(S, TODAY) {
    var H = 365;
    var MS = 864e5;
    function parseDate(s) { if (!s) return null; var p = s.split("-").map(Number); if (p.length !== 3 || p.some(isNaN)) return null; return new Date(p[0], p[1] - 1, p[2]); }
    function diffDays(d) { return Math.round((d - TODAY) / MS); }
    function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

    function occurrences(it) {
      var out = [];
      var start = parseDate(it.next);
      if (!start || !(it.amount > 0)) return out;
      var d0 = diffDays(start);
      if (it.freq === "once") { if (d0 >= 0 && d0 <= H) out.push(d0); return out; }
      if (it.freq === "weekly" || it.freq === "biweekly") {
        var step = it.freq === "weekly" ? 7 : 14, d = d0;
        if (d < 0) d += Math.ceil(-d / step) * step;
        for (; d <= H; d += step) out.push(d);
        return out;
      }
      var anchor = start.getDate();
      for (var m = 0; m < 600; m++) {
        var y = start.getFullYear(), mo = start.getMonth() + m;
        var yy = y + Math.floor(mo / 12), mm = ((mo % 12) + 12) % 12;
        var dt = new Date(yy, mm, Math.min(anchor, daysInMonth(yy, mm)));
        var off = diffDays(dt);
        if (off > H) break;
        if (off >= 0) out.push(off);
      }
      return out;
    }

    var M = null;
    function build() {
      var inc = new Array(H + 1).fill(0), bil = new Array(H + 1).fill(0), ev = [];
      for (var i = 0; i <= H; i++) ev.push([]);
      S.incomes.forEach(function (it) { occurrences(it).forEach(function (d) { inc[d] += it.amount; ev[d].push({ name: it.name || "Income", amt: it.amount, type: "in" }); }); });
      S.bills.forEach(function (it) { occurrences(it).forEach(function (d) { bil[d] += it.amount; ev[d].push({ name: it.name || "Bill", amt: it.amount, type: "out" }); }); });
      var cum = [], c = 0;
      for (var d = 0; d <= H; d++) { c += inc[d] - bil[d]; cum[d] = c; }
      M = { inc: inc, bil: bil, ev: ev, cum: cum };
    }

    function balanceAt(d, daily, extra) { return S.balance - (extra || 0) + M.cum[d] - daily * (d + 1); }
    function runwayFor(daily, extra) {
      for (var d = 0; d <= H; d++) if (balanceAt(d, daily, extra) < 0) return d;
      return Infinity;
    }
    function nextPayday() {
      for (var d = 1; d <= H; d++) if (M.inc[d] > 0) return d;
      return null;
    }
    function safeFor(extra) {
      var np = nextPayday(), N = np === null ? 30 : np, s = Infinity;
      for (var k = 0; k < N; k++) {
        var a = S.balance - (extra || 0) + M.cum[k] - S.buffer;
        s = Math.min(s, a / (k + 1));
      }
      return Math.max(0, s);
    }
    function shortBeforePay(extra) {
      var np = nextPayday(), N = np === null ? 30 : np, worst = Infinity, first = null;
      for (var k = 0; k < N; k++) {
        var b = balanceAt(k, S.daily, extra);
        if (b < worst) worst = b;
        if (b < 0 && first === null) first = k;
      }
      return worst < 0 ? { amount: -worst, day: first } : null;
    }
    function maxDailyFor(target) {
      if (runwayFor(0) < target) return null;
      var lo = 0, hi = 2000;
      for (var i = 0; i < 30; i++) { var mid = (lo + hi) / 2; if (runwayFor(mid) >= target) lo = mid; else hi = mid; }
      return lo;
    }

    build();
    return {
      runway: runwayFor(S.daily),
      nextPayday: nextPayday(),
      safe: safeFor(0),
      short: shortBeforePay(0),
      cap90: maxDailyFor(90),
      purchase: function (amt) { return { runwayAfter: runwayFor(S.daily, amt), safeAfter: safeFor(amt), shortAfter: shortBeforePay(amt) }; }
    };
  }
  return { run: run };
});
