# Lab Asset Tracker
Single-file HTML app (no deps). Source in `src/` (css, shell.html, js/NN-*.js), bundled with `node build.js` into
`lab-tracker.html` (the deliverable, copied to a network share). Data = one JSON file in a shared folder via the
File System Access API (Edge/Chrome); merge logic in `src/js/01-store.js`. Test locally: `python3 -m http.server`
and use "Try it with sample data". No automated tests yet.
