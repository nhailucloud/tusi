/* Renders TusiTests results. Builds DOM nodes with textContent only. */
(function () {
  "use strict";
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(v) {
    if (v === Infinity) return "365+";
    if (v === null || v === undefined) return "none";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
    if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(2);
    return String(v);
  }
  function tile(k, v, cls, p) {
    var t = el("div", "tile"); t.appendChild(el("div", "k", k)); t.appendChild(el("div", "v " + (cls || ""), v)); if (p) t.appendChild(el("p", null, p)); return t;
  }
  function render() {
    var r = window.TusiTests.runAll();
    var tiles = document.getElementById("tiles"); tiles.textContent = "";
    var allPass = r.passed === r.total;
    tiles.appendChild(tile("Hand worked checks", r.passed + " of " + r.total, allPass ? "good" : "bad", allPass ? "All pass in both modes." : (r.total - r.passed) + " failing. See red rows."));
    var pc = r.parity.runs * r.parity.checksPerRun, pf = r.parity.failures.length;
    tiles.appendChild(tile("Match with prototype", (pc - pf).toLocaleString("en-US") + " of " + pc.toLocaleString("en-US"), pf ? "bad" : "good", r.parity.runs + " random budgets, " + r.parity.checksPerRun + " results each."));
    tiles.appendChild(tile("Changed by the fixes", String(r.cases.filter(function (c) { return c.changed; }).length), "", "Checks where TUSI is meant to differ from the prototype."));
    var bk = window.TusiBackupTests ? window.TusiBackupTests.run() : [];
    var bkPass = bk.filter(function (x) { return x.pass; }).length;
    tiles.appendChild(tile("Backup file checks", bkPass + " of " + bk.length, bk.length && bkPass === bk.length ? "good" : "bad", "Good files restore, bad or tampered files are refused."));
    tiles.appendChild(tile("Engine version", r.engineVersion, "", "Run on " + new Date().toLocaleString("en-US")));

    var host = document.getElementById("groups"); host.textContent = "";
    var groups = [];
    r.cases.forEach(function (c) { var g = groups.find(function (x) { return x.name === c.group; }); if (!g) groups.push(g = { name: c.group, rows: [] }); g.rows.push(c); });
    groups.forEach(function (g) {
      var sec = el("section", "group"); sec.appendChild(el("h2", null, g.name));
      var wrap = el("div", "tbl-wrap"), tbl = el("table"), thead = el("thead"), hr = el("tr");
      ["Check", "Prototype", "TUSI", "Result"].forEach(function (h) { var th = el("th", null, h); th.scope = "col"; hr.appendChild(th); });
      thead.appendChild(hr); tbl.appendChild(thead);
      var tb = el("tbody");
      g.rows.forEach(function (c) {
        var tr = el("tr"), td = el("td");
        td.appendChild(el("b", null, c.name)); td.appendChild(el("span", "why", c.why)); tr.appendChild(td);
        ["prototype", "tusi"].forEach(function (m) {
          var cell = el("td", "n"); cell.appendChild(document.createTextNode(fmt(c.got[m]))); cell.appendChild(el("span", "exp", "expected " + fmt(c.expect[m]))); tr.appendChild(cell);
        });
        var res = el("td"); res.appendChild(el("span", "pill " + (c.pass ? "good" : "bad"), c.pass ? "Pass" : "Fail"));
        if (c.changed) { res.appendChild(document.createTextNode(" ")); res.appendChild(el("span", "pill fix", "Changed by fix")); }
        tr.appendChild(res); tb.appendChild(tr);
      });
      tbl.appendChild(tb); wrap.appendChild(tbl); sec.appendChild(wrap); host.appendChild(sec);
    });
    if (bk.length) {
      var bs = el("section", "group"); bs.appendChild(el("h2", null, "Backup files"));
      var bw = el("div", "tbl-wrap"), bt = el("table"), bh = el("thead"), bhr = el("tr");
      ["Check", "What happened", "Result"].forEach(function (h) { var th = el("th", null, h); th.scope = "col"; bhr.appendChild(th); });
      bh.appendChild(bhr); bt.appendChild(bh);
      var bb = el("tbody");
      bk.forEach(function (c) {
        var tr = el("tr"); tr.appendChild(el("td", null, c.name)); tr.appendChild(el("td", null, c.detail));
        var res = el("td"); res.appendChild(el("span", "pill " + (c.pass ? "good" : "bad"), c.pass ? "Pass" : "Fail")); tr.appendChild(res); bb.appendChild(tr);
      });
      bt.appendChild(bb); bw.appendChild(bt); bs.appendChild(bw); host.appendChild(bs);
    }
    if (pf) {
      var sec = el("section", "group"); sec.appendChild(el("h2", null, "Parity differences"));
      r.parity.failures.slice(0, 20).forEach(function (f) { sec.appendChild(el("p", null, "Run " + f.run + " (" + f.today + "), " + f.check + ": engine " + fmt(f.engine) + ", prototype " + fmt(f.prototype))); });
      host.appendChild(sec);
    }
  }
  document.getElementById("rerun").addEventListener("click", render);
  render();
})();
