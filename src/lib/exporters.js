// Exports en formats ouverts et bureautiques : CSV, tableur (XML Spreadsheet), Word, XML, JSON, impression PDF.
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function download(filename, mime, content) {
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return true;
  } catch (e) { return false; }
}

export function toCSV(rows, headers) {
  const q = (v) => {
    const s = String(v == null ? '' : v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(q).join(';'), ...rows.map((r) => r.map(q).join(';'))];
  return '﻿' + lines.join('\r\n');
}
export const downloadCSV = (name, headers, rows) => download(name, 'text/csv;charset=utf-8', toCSV(rows, headers));

// Classeur au format XML Spreadsheet 2003 (ouvrable par Excel et LibreOffice Calc)
export function toXLS(sheets) {
  const cell = (v) => typeof v === 'number' && isFinite(v) ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const ws = sheets.map((sh) => `<Worksheet ss:Name="${esc(sh.name).slice(0, 31)}"><Table>` +
    `<Row>${sh.headers.map((h) => `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('')}</Row>` +
    sh.rows.map((r) => `<Row>${r.map(cell).join('')}</Row>`).join('') + '</Table></Worksheet>').join('');
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E6EAF8" ss:Pattern="Solid"/></Style></Styles>${ws}</Workbook>`;
}
export const downloadXLS = (name, sheets) => download(name, 'application/vnd.ms-excel', toXLS(sheets));

const DOC_CSS = 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222}h1{font-size:16pt;text-align:center;color:#1F2A63}h2{font-size:12.5pt;color:#1F2A63;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 6px;font-size:9.5pt;text-align:left}th{background:#E6EAF8}.doc-meta{font-size:9pt;color:#555;border-bottom:2px solid #3A4A99;padding-bottom:6px;margin-bottom:10px}.sig div{border:1px dashed #999;padding:8px;margin:6px 0;min-height:50px}';
export function downloadDoc(name, title, bodyHtml) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}</style></head><body>${bodyHtml}</body></html>`;
  return download(name, 'application/msword', '﻿' + html);
}
export const downloadJSON = (name, obj) => download(name, 'application/json', JSON.stringify(obj, null, 2));
export const downloadXML = (name, xml) => download(name, 'application/xml', xml);

export function printHtml(html) {
  let area = document.querySelector('.print-area');
  if (!area) { area = document.createElement('div'); area.className = 'print-area'; document.body.appendChild(area); }
  area.innerHTML = `<div class="doc">${html}</div>`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch (e) { /* ignore */ } setTimeout(done, 800); }, 50);
}
