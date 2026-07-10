// Prompt Box test harness — Chrome API shim. DEV ONLY, never shipped.
// Loaded inside the harness iframe BEFORE sync-config.js so the real popup
// scripts run against in-memory chrome.* fakes on localhost.
//
// Observability hooks (read from tests via the iframe's window):
//   __confirmCalls   — every confirm() message, in order
//   __confirmNextResult — set false to make the NEXT confirm return false (one-shot)
//   __fetchLog       — every intercepted Supabase request {method, url, body, tombstonesAtSend}
//   __fetchRoutes    — prepend {match, status, body, headers} objects to override responses
//   __storageWrites  — every storage set/remove {area, op, keys}
//   __seed           — the exact fixtures this page was seeded with
(function () {
  'use strict';

  var config = window.__HARNESS_CONFIG || {};
  var mode = config.mode || 'local'; // 'local' | 'sync' | 'cloud'

  window.__confirmCalls = [];
  window.__confirmNextResult = true;
  window.__fetchLog = [];
  window.__fetchRoutes = [];
  window.__storageWrites = [];

  window.confirm = function (msg) {
    window.__confirmCalls.push(String(msg));
    var r = window.__confirmNextResult !== false;
    window.__confirmNextResult = true; // one-shot override, then back to auto-accept
    return r;
  };

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  // ---- fixtures ----
  var T0 = 1751500000000; // fixed epoch base for deterministic ids/sorts
  function P(i, title, text, tags, extra) {
    var p = {
      id: T0 + i * 1000,
      title: title,
      text: text,
      tags: tags,
      shortcut: '',
      isFavorite: false,
      isSensitive: false,
      createdAt: T0 + i * 1000,
      updatedAt: T0 + i * 1000,
    };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return p;
  }
  var FIXTURES = [
    P(1, 'Blog Post Outline', 'Write a detailed outline for a blog post about the given topic with H2 sections and a hook intro.', ['Writing'], { isFavorite: true }),
    P(2, 'Code Review Checklist', 'Review this diff for correctness, security, and style. List findings by severity.', ['Coding'], { shortcut: 'crev' }),
    P(3, 'Meeting Summary', 'Summarize this meeting transcript into decisions, action items, and owners.', ['Business']),
    P(4, 'API Error Debugging', 'Given this stack trace and request payload, find the root cause step by step.', ['Coding'], { isSensitive: true }),
    P(5, 'Creative Story Starter', 'Write the first paragraph of a story that begins in a lighthouse during a storm.', ['Creative']),
    P(6, 'Research Summarizer', 'Summarize this paper: key claims, methods, limitations, and open questions.', ['Research']),
    P(7, 'Polite Email Rewrite', 'Rewrite this email to be concise and warm while keeping every commitment.', ['Writing', 'Business'], { isFavorite: true }),
    P(8, 'SQL Query Helper', 'Write a Postgres query for the following requirement and explain the plan.', ['Coding']),
    P(9, 'Client Billing Notes', 'Draft an invoice note for the client including the confidential rate table.', ['Business'], { isSensitive: true }),
    P(10, 'Daily Standup', 'Turn these bullet points into a crisp standup update: yesterday, today, blockers.', ['General']),
  ];
  function uuidFor(i) {
    var n = String(i + 1);
    while (n.length < 12) n = '0' + n;
    return '00000000-0000-4000-8000-' + n;
  }

  var DEFAULT_TAGS = ['General', 'Writing', 'Coding', 'Research', 'Creative', 'Business', 'Favorite']
    .map(function (n) { return { name: n, isDefault: true, isFavorite: false }; });
  var FILTER_SETTINGS = { tagFilter: 'all', sortBy: 'newest' };

  var localSeed = {};
  var syncSeed = { availableTags: DEFAULT_TAGS, filterSettings: FILTER_SETTINGS };
  var seededPrompts;
  if (mode === 'sync') {
    seededPrompts = clone(FIXTURES);
    syncSeed.prompts = seededPrompts;
    // storagePref unset -> popup defaults to 'sync'
  } else if (mode === 'cloud') {
    // First 8 fixtures have cloud uuids; the last 2 are local-only (never pushed).
    seededPrompts = FIXTURES.map(function (p, idx) {
      var c = clone(p);
      if (idx < 8) c.uuid = uuidFor(idx);
      return c;
    });
    localSeed = {
      storagePref: 'cloud',
      prompts: seededPrompts,
      pb_session: {
        access_token: 'harness-access-token',
        refresh_token: 'harness-refresh-token',
        expires_at: Date.now() + 6 * 3600 * 1000, // far from the 60s refresh window
        email: 'harness@promptbox.test',
      },
      pb_is_pro: true,
      pb_last_push: T0 + 100000, // after every fixture updatedAt: no spurious first push
      pb_last_pull: new Date(T0 + 100000).toISOString(),
    };
  } else {
    seededPrompts = clone(FIXTURES);
    localSeed = { storagePref: 'local', prompts: seededPrompts };
  }
  window.__seed = { mode: mode, prompts: clone(seededPrompts) };

  // ---- in-memory chrome.storage areas (async like the real thing) ----
  function makeArea(areaName, seed) {
    var data = {};
    Object.keys(seed || {}).forEach(function (k) { data[k] = clone(seed[k]); });
    function keyList(keys) {
      if (keys === null || keys === undefined) return { ks: Object.keys(data), defaults: {} };
      if (typeof keys === 'string') return { ks: [keys], defaults: {} };
      if (Array.isArray(keys)) return { ks: keys, defaults: {} };
      return { ks: Object.keys(keys), defaults: keys };
    }
    return {
      __data: data,
      get: function (keys, cb) {
        var norm = keyList(keys);
        var out = {};
        norm.ks.forEach(function (k) {
          var v = Object.prototype.hasOwnProperty.call(data, k) ? clone(data[k]) : clone(norm.defaults[k]);
          if (v !== undefined) out[k] = v;
        });
        setTimeout(function () { cb(out); }, 0);
      },
      set: function (obj, cb) {
        Object.keys(obj).forEach(function (k) { data[k] = clone(obj[k]); });
        window.__storageWrites.push({ area: areaName, op: 'set', keys: Object.keys(obj) });
        if (cb) setTimeout(cb, 0);
      },
      remove: function (keys, cb) {
        var ks = Array.isArray(keys) ? keys : [keys];
        ks.forEach(function (k) { delete data[k]; });
        window.__storageWrites.push({ area: areaName, op: 'remove', keys: ks });
        if (cb) setTimeout(cb, 0);
      },
      clear: function (cb) {
        Object.keys(data).forEach(function (k) { delete data[k]; });
        window.__storageWrites.push({ area: areaName, op: 'clear', keys: [] });
        if (cb) setTimeout(cb, 0);
      },
    };
  }

  var shim = {
    storage: {
      local: makeArea('local', localSeed),
      sync: makeArea('sync', syncSeed),
      onChanged: { addListener: function () {}, removeListener: function () {} },
    },
    runtime: {
      id: 'harness-extension-id',
      lastError: undefined,
      getURL: function (path) { return '/' + String(path).replace(/^\/+/, ''); },
      sendMessage: function () {
        // Sign-in delegation target (the service worker) does not exist here.
        return Promise.resolve({ ok: false, error: 'sign-in unavailable in harness' });
      },
      onMessage: { addListener: function () {} },
    },
    identity: {
      getRedirectURL: function () { return 'https://harness-extension-id.chromiumapp.org/'; },
      launchWebAuthFlow: function (opts, cb) {
        shim.runtime.lastError = { message: 'OAuth unavailable in harness' };
        try { cb(undefined); } finally { shim.runtime.lastError = undefined; }
      },
    },
  };
  window.chrome = shim;

  // ---- fetch interceptor: absorb ALL Supabase traffic, pass everything else ----
  var realFetch = window.fetch.bind(window);
  function jsonResponse(status, body, headers) {
    var text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, {
      status: status,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    });
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isSupabase = url.indexOf('/rest/v1/') !== -1 || url.indexOf('/auth/v1/') !== -1 || url.indexOf('.supabase.co') !== -1;
    if (!isSupabase) return realFetch(input, init);

    var method = ((init && init.method) || 'GET').toUpperCase();
    var body = init && init.body;
    var parsedBody = null;
    if (typeof body === 'string') {
      try { parsedBody = JSON.parse(body); } catch (e) { parsedBody = body; }
    }
    var entry = {
      method: method,
      url: url,
      body: parsedBody,
      // snapshot of the tombstone queue at send time (BD3 ordering assertion)
      tombstonesAtSend: clone(shim.storage.local.__data.pb_tombstones || []),
    };
    window.__fetchLog.push(entry);

    // Custom routes first (tests can inject failures/payloads).
    for (var i = 0; i < window.__fetchRoutes.length; i++) {
      var r = window.__fetchRoutes[i];
      var hit = (typeof r.match === 'string')
        ? url.indexOf(r.match) !== -1
        : r.match.test(url);
      if (hit && (!r.method || r.method.toUpperCase() === method)) {
        if (r.once) window.__fetchRoutes.splice(i, 1);
        return Promise.resolve(jsonResponse(r.status || 200, r.body !== undefined ? r.body : [], r.headers));
      }
    }

    // Defaults: a healthy, empty cloud.
    if (url.indexOf('/auth/v1/user') !== -1) {
      return Promise.resolve(jsonResponse(200, { email: 'harness@promptbox.test' }));
    }
    if (url.indexOf('/auth/v1/logout') !== -1) {
      return Promise.resolve(jsonResponse(204, ''));
    }
    if (url.indexOf('/auth/v1/token') !== -1) {
      return Promise.resolve(jsonResponse(200, {
        access_token: 'harness-access-token',
        refresh_token: 'harness-refresh-token',
        expires_in: 21600,
      }));
    }
    if (url.indexOf('/rest/v1/profiles') !== -1) {
      return Promise.resolve(jsonResponse(200, [{ is_pro: true, plan: 'lifetime' }]));
    }
    if (url.indexOf('/rest/v1/prompts') !== -1) {
      if (method === 'POST') {
        return Promise.resolve(jsonResponse(201, ''));
      }
      // count probe (cloudPromptCount) vs delta pull — both fine with empty,
      // the probe just needs a content-range header.
      return Promise.resolve(jsonResponse(200, [], { 'Content-Range': '*/0' }));
    }
    return Promise.resolve(jsonResponse(200, []));
  };
})();
