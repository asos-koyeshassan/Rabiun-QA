// Tiny CSV helpers for the history files in data/. Values are quoted only
// when needed, so test titles with commas ("loads, no broken images, ...")
// survive a round trip.
import fs from 'node:fs';
import path from 'node:path';

function parseLine(line) {
  const out = [];
  let cur = '',
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

function formatValue(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const [header, ...lines] = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '').trim().split('\n');
  const cols = parseLine(header);
  return lines.filter(Boolean).map((line) => {
    const vals = parseLine(line);
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? '']));
  });
}

// Appends rows (objects keyed by column). If the file exists with an older,
// shorter header, the header is upgraded in place — new columns only ever go
// on the end, so old rows still line up and just read as blank for them.
export function appendCsv(filePath, columns, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const header = columns.join(',');
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, header + '\n');
  else {
    const text = fs.readFileSync(filePath, 'utf8');
    const firstLine = text.slice(0, text.indexOf('\n'));
    if (firstLine.replace(/\r/g, '') !== header) {
      if (!header.startsWith(firstLine.replace(/\r/g, ''))) {
        throw new Error(`${path.basename(filePath)}: header "${firstLine}" can't be upgraded to "${header}"`);
      }
      fs.writeFileSync(filePath, header + text.slice(text.indexOf('\n')));
    }
  }
  if (rows.length) fs.appendFileSync(filePath, rows.map((r) => columns.map((c) => formatValue(r[c])).join(',')).join('\n') + '\n');
}
