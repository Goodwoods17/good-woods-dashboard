// Copy the pdf.js worker into /public so it is served as a static asset
// (workerSrc = "/pdf.worker.min.mjs"). We do NOT bundle it via webpack:
// `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` makes
// webpack try to minify the worker and Terser fails on it. Copying the
// already-minified file straight from node_modules sidesteps that, and
// running this on predev/prebuild keeps it in lockstep with the installed
// pdfjs-dist version (no committed binary that silently drifts).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve("pdfjs-dist/package.json")), "build/pdf.worker.min.mjs");
const dest = join(process.cwd(), "public", "pdf.worker.min.mjs");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-pdf-worker] ${src} -> ${dest}`);
