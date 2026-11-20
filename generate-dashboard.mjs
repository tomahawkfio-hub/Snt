import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
writeFileSync(new URL('./dashboard.mjs', import.meta.url), 'export const dashboard = '+JSON.stringify(html)+';\n');
