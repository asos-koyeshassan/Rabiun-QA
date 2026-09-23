// Builds the GitHub Pages dashboard in two steps:
//  1. dashboard/data.mjs records this run into data/*.csv and works out every
//     number the dashboard shows (streaks, pass rates, Lighthouse trends...).
//     That object is written to dashboard/data.json, so it's public and any
//     page (or a future client-side theme) can load it.
//  2. A theme from dashboard/themes/ turns the same object into index.html.
//     DASHBOARD_THEME picks one (default "basic").
// Set DASHBOARD_NO_RECORD=1 to rebuild the page without adding a history row.
import fs from 'node:fs';
import path from 'node:path';
import { buildDashboardData } from './dashboard/data.mjs';

const OUT_DIR = path.join(process.cwd(), 'dashboard');
const THEME = process.env.DASHBOARD_THEME || 'basic';

const data = buildDashboardData({ record: !process.env.DASHBOARD_NO_RECORD });
const { render } = await import(`./dashboard/themes/${THEME}.mjs`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'data.json'), JSON.stringify(data, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), render(data));
console.log(`Dashboard (${THEME} theme) written to ${OUT_DIR}`);
