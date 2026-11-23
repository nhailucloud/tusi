/*
 * TUSI device storage.
 * Saves one state object on this device only. Never sends it anywhere.
 * Order of preference: IndexedDB, then localStorage, then memory only
 * (private browsing or blocked storage), which the app reports to the user.
 */
(function (root) {
  "use strict";

  var DB_NAME = "tusi", STORE = "kv", KEY = "state", LS_KEY = "tusi-state-v1";
  var MAX_BYTES = 2 * 1024 * 1024; /* refuse to save absurdly large state */
  var backend = "memory", db = null, memoryCopy = null;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error("no indexedDB")); return; }
      var req;
      try { req = root.indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("open failed")); };
      req.onblocked = function () { reject(new Error("blocked")); };
    });
  }
  function idb(mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, mode), st = tx.objectStore(STORE), req = fn(st);
      tx.oncomplete = function () { resolve(req && req.result); };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error("transaction failed")); };
    });
  }
  function lsWorks() {
    try { var k = "__tusi_probe"; root.localStorage.setItem(k, "1"); root.localStorage.removeItem(k); return true; } catch (e) { return false; }
  }

  /* Opens storage and returns the saved state (or null). */
  function init() {
    return openDB().then(function (d) {
      db = d; backend = "indexeddb";
      return idb("readonly", function (st) { return st.get(KEY); }).then(function (v) {
        if (v) return v;
        /* migrate from localStorage if an earlier save landed there */
        if (lsWorks()) {
          try { var raw = root.localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
        }
        return null;
      });
    }).catch(function () {
      if (lsWorks()) {
        backend = "localstorage";
        try { var raw = root.localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
      }
      backend = "memory";
      return memoryCopy;
    });
  }

  function save(state) {
    var json;
    try { json = JSON.stringify(state); } catch (e) { return Promise.reject(e); }
    if (json.length > MAX_BYTES) return Promise.reject(new Error("Data is too large to save"));
    if (backend === "indexeddb") {
      return idb("readwrite", function (st) { return st.put(JSON.parse(json), KEY); }).catch(function (e) {
        if (lsWorks()) { backend = "localstorage"; root.localStorage.setItem(LS_KEY, json); return; }
        throw e;
      });
    }
    if (backend === "localstorage") {
      try { root.localStorage.setItem(LS_KEY, json); return Promise.resolve(); } catch (e) { return Promise.reject(e); }
    }
    memoryCopy = JSON.parse(json);
    return Promise.resolve();
  }

  function clear() {
    var jobs = [];
    if (db) jobs.push(idb("readwrite", function (st) { return st.delete(KEY); }).catch(function () {}));
    try { root.localStorage.removeItem(LS_KEY); } catch (e) {}
    memoryCopy = null;
    return Promise.all(jobs);
  }

  /* Asks the browser not to clear TUSI's data when space runs low or the site sits unused (helps on iPhone). */
  function persist() {
    try {
      if (root.navigator && navigator.storage && navigator.storage.persist) {
        return navigator.storage.persisted().then(function (p) { return p || navigator.storage.persist(); }).catch(function () { return false; });
      }
    } catch (e) {}
    return Promise.resolve(false);
  }

  root.TusiStore = { init: init, save: save, clear: clear, persist: persist, backend: function () { return backend; } };
})(typeof globalThis !== "undefined" ? globalThis : this);
