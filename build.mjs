import * as esbuild from 'esbuild';
import fs from 'fs';
import zlib from 'zlib';

const dev = process.argv.includes('--dev');
const r = await esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: !dev,
  format: 'iife',
  target: ['es2019', 'chrome80', 'firefox78', 'safari13', 'edge80'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  write: false,
  legalComments: 'none',
  charset: 'utf8',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/styles.css', 'utf8');
const cssMin = (await esbuild.transform(css, { loader: 'css', minify: !dev, target: ['chrome80', 'safari13', 'firefox78'] })).code;
const favicon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1D1D1F"/><path d="M12 15l1.8-6h7.4L19.4 15" fill="#fff" opacity=".5"/><path d="M9 15h14v9H9z" fill="#fff"/><path d="M13 19.5h6" stroke="#1D1D1F" stroke-width="2" stroke-linecap="round"/></svg>');
const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Démonstration · Vote électronique à distance et en séance</title>
<meta name="description" content="Environnement de démonstration (données fictives) des solutions de vote électronique à distance et en séance, AOO Resah n° 2026-R032-000-000.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#1D1D1F">
<link rel="icon" href="${favicon}">
<style>${cssMin}</style>
</head>
<body>
<noscript><div style="padding:24px;font-family:system-ui,sans-serif">Cette démonstration nécessite JavaScript. En production, le parcours électeur dispose d'un mode dégradé sans JavaScript.</div></noscript>
<div id="app"></div>
<script>${js}</script>
</body>
</html>`;
let out = html;
for (let i = 0; i < 2; i++) {
  const kb = Math.round(Buffer.byteLength(out) / 1024);
  const gz = Math.round(zlib.gzipSync(out).length / 1024);
  out = html.replace(/"__PAGE_KB__"/g, String(kb)).replace(/"__PAGE_GZ_KB__"/g, String(gz));
}
// OUT=chemin/index.html permet de construire ailleurs que dans dist/ (constructions parallèles)
const outFile = process.env.OUT || 'dist/index.html';
fs.mkdirSync(outFile.replace(/[\/][^\/]*$/, '') || '.', { recursive: true });
fs.writeFileSync(outFile, out);
console.log('built ' + outFile, (Buffer.byteLength(out) / 1024).toFixed(1) + ' KB, gzip ' + (zlib.gzipSync(out).length / 1024).toFixed(1) + ' KB', '(js ' + (js.length / 1024).toFixed(1) + ' KB, css ' + (cssMin.length / 1024).toFixed(1) + ' KB)');
