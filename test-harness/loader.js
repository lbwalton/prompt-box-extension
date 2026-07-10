// Prompt Box test harness loader. DEV ONLY, never shipped.
// Fetches the REAL popup.html (unmodified on disk), injects the chrome shim
// before its first script tag, and runs it in a same-origin srcdoc iframe so
// script order and DOMContentLoaded timing match the real popup.
//
// Serve the REPO ROOT:  python3 -m http.server 5641
// Open:                 http://127.0.0.1:5641/test-harness/?mode=local|sync|cloud
// Assert from tests:    document.getElementById('popupFrame').contentWindow.*
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var mode = params.get('mode') || 'local';

  document.querySelectorAll('#hud a[data-mode]').forEach(function (a) {
    if (a.getAttribute('data-mode') === mode) a.classList.add('active');
  });

  fetch('/popup.html')
    .then(function (res) {
      if (!res.ok) throw new Error('could not fetch /popup.html (' + res.status + '). Serve the REPO ROOT, not test-harness/.');
      return res.text();
    })
    .then(function (html) {
      var cfg = '<script>window.__HARNESS_CONFIG = ' + JSON.stringify({ mode: mode }) + ';<\/script>';
      var shimTag = '<script src="/test-harness/chrome-shim.js"><\/script>';
      // Relative asset/script URLs must resolve against the repo root, not /test-harness/.
      html = html.replace(/<head>/i, '<head><base href="/">');
      var firstScript = html.search(/<script\s/i);
      if (firstScript === -1) throw new Error('no <script> tag found in popup.html');
      html = html.slice(0, firstScript) + cfg + shimTag + html.slice(firstScript);
      document.getElementById('popupFrame').srcdoc = html;
    })
    .catch(function (e) {
      document.getElementById('err').textContent = 'Harness error: ' + e.message;
    });
})();
