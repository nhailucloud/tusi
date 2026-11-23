/* Backup file checks. Runs in the browser test page (test.html) and in Node: node tests/backup.test.js */
(function (root, factory) {
  var api = factory(typeof module === "object" && module.exports ? require("./backup.js") : root.TusiBackup);
  if (typeof module === "object" && module.exports) module.exports = api; else root.TusiBackupTests = api;
})(typeof self !== "undefined" ? self : this, function (B) {
  "use strict";
  function run() {
  var now = Date.UTC(2026, 10, 23, 12);
  var state = { balance: 1250.5, daily: 35, buffer: 100, balanceUpdated: "2026-11-23", lastCheckin: "2026-11-20", setupDate: "2026-11-01",
    incomes: [{ id: "a1", name: "Paycheck", amount: 900, freq: "biweekly", next: "2026-11-28" }],
    bills: [{ id: "b1", name: "Rent", amount: 1100, freq: "monthly", next: "2026-11-30" }],
    log: [{ id: "c1", date: "2026-11-23", t: now, amt: 12.5, note: "Food" }], settings: { theme: "dark", range: 30 } };
  var good = JSON.stringify(B.make(state, { now, appVersion: "0.6.0" }));
  var mut = (fn) => { const o = JSON.parse(good); fn(o); return JSON.stringify(o); };
  var cases = [
    ["round trip works", good, true],
    ["file name", B.fileName(now) === "tusi-backup-2026-11-23.json", "eq"],
    ["empty text", "", false, "empty"],
    ["not JSON", "hello", false, "JSON"],
    ["JSON array", "[]", false, "not a TUSI backup"],
    ["other app", mut((o) => { o.app = "Other"; }), false, "not a TUSI backup"],
    ["newer format", mut((o) => { o.format = 2; }), false, "newer version"],
    ["no data", mut((o) => { delete o.data; }), false, "no data"],
    ["balance as text", mut((o) => { o.data.balance = "1250"; }), false, "Balance is not a number"],
    ["huge amount", mut((o) => { o.data.balance = 1e12; }), false, "too large"],
    ["negative daily", mut((o) => { o.data.daily = -5; }), false, "below zero"],
    ["bill bad date", mut((o) => { o.data.bills[0].next = "2026-02-31"; }), false, "Bill 1 date"],
    ["bill zero amount", mut((o) => { o.data.bills[0].amount = 0; }), false, "above zero"],
    ["income bad freq", mut((o) => { o.data.incomes[0].freq = "daily"; }), false, "repeat"],
    ["purchase not object", mut((o) => { o.data.log[0] = 5; }), false, "Purchase 1"],
    ["missing bills", mut((o) => { delete o.data.bills; }), false, "bills list"],
    ["too many purchases", mut((o) => { o.data.log = Array(501).fill(o.data.log[0]); }), false, "more than 500"],
    ["proto pollution key", good.replace('"app":"TUSI"', '"__proto__":{"x":1},"app":"TUSI"'), false, "does not accept"],
    ["nested constructor key", mut((o) => { o.data.bills[0].constructor = { prototype: {} }; }).replace('"constructor":{"prototype":{}}', '"constructor":{"prototype":{}}'), false, "does not accept"],
    ["oversized", " ".repeat(B.MAX_BYTES + 1), false, "too large"],
    ["long name trimmed", mut((o) => { o.data.bills[0].name = "x".repeat(300); }), true],
    ["bad id dropped", mut((o) => { o.data.bills[0].id = "<img src=x>"; }), true],
    ["script note kept as plain text", mut((o) => { o.data.log[0].note = "<script>alert(1)</script>"; }), true],
  ];
    return cases.map(function (c) {
      var name = c[0], input = c[1], want = c[2], msg = c[3], ok, detail = "";
      if (want === "eq") { ok = input === true; detail = "File name is " + B.fileName(now); }
      else {
        var r = B.check(input);
        ok = r.ok === want && (want || (r.error || "").indexOf(msg) >= 0);
        if (name === "round trip works") ok = ok && r.data.balance === 1250.5 && r.data.bills[0].name === "Rent" && r.data.log[0].amt === 12.5 && r.summary.purchases === 1;
        if (name === "long name trimmed") ok = ok && r.data.bills[0].name.length === 40;
        if (name === "bad id dropped") ok = ok && r.data.bills[0].id === undefined;
        detail = r.ok ? "Accepted" : "Refused: " + r.error;
      }
      return { name: name, pass: ok, detail: detail };
    }).concat([{ name: "no prototype pollution", pass: ({}).x === undefined, detail: "Plain objects unchanged after all checks" }]);
  }
  return { run: run };
});

if (typeof module === "object" && module.exports && typeof require === "function" && require.main === module) {
  var res = module.exports.run(), pass = res.filter(function (r) { return r.pass; }).length;
  res.forEach(function (r) { console.log((r.pass ? "PASS " : "FAIL ") + r.name + "  (" + r.detail + ")"); });
  console.log(pass + "/" + res.length + " passed");
  process.exit(pass === res.length ? 0 : 1);
}
