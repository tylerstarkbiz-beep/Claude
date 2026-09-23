// Entry for the self-contained demo: load SQLite, start the in-page API, then boot the normal app.
import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';
import { provideSqlJs } from './shims/sqlite.ts';

// Node globals the server modules touch.
const g = globalThis as any;
g.process ??= { argv: [], env: {} };
g.Buffer ??= {
  from(data: string) {
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  },
};
// The sandboxed page can't show confirm dialogs (they return false), so treat them as "yes" in the demo.
window.confirm = () => true;

provideSqlJs(await initSqlJs());
const { startDemoServer } = await import('./server.ts');
startDemoServer();

const banner = document.createElement('div');
banner.textContent = 'Demo with sample data. Changes reset when you reload.';
banner.className = 'demo-banner';
document.body.appendChild(banner);

await import('../src/main.tsx');
