// Runs the real API modules in the page and answers the app's fetch('/api/...') calls.
import { openDb } from '../server/db.ts';
import { seed } from '../server/seed.ts';
import { createApi } from '../server/api.ts';
import { createNotesApi } from '../server/notes.ts';
import { createTimeApi } from '../server/time.ts';
import { createInvoicesApi } from '../server/invoices.ts';
import { uploads } from './shims/fs.ts';
import type { DemoRouter, Route } from './shims/express.ts';

export function startDemoServer() {
  const db = openDb(':memory:');
  seed(db);
  const routers = [createNotesApi(db, '/uploads'), createTimeApi(db), createInvoicesApi(db), createApi(db)] as unknown as DemoRouter[];
  const routes: Route[] = routers.flatMap((r) => r.routes);

  function dispatch(method: string, url: string, body: unknown): Promise<{ status: number; data: unknown }> {
    const u = new URL(url, 'http://demo');
    const path = u.pathname.replace(/^\/api/, '');
    const req: any = { method, path, query: Object.fromEntries(u.searchParams), body: body ?? {}, params: {} };
    const fail = (err: any) => ({ status: typeof err?.status === 'number' ? err.status : 500, data: { error: err?.message ?? 'Error' } });
    return new Promise((resolve) => {
      let i = 0;
      const res: any = {
        statusCode: 200,
        headersSent: false,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: unknown) {
          this.headersSent = true;
          resolve({ status: this.statusCode, data });
        },
      };
      const next = (err?: unknown) => {
        if (err) return resolve(fail(err));
        while (i < routes.length) {
          const r = routes[i++];
          if (r.method !== method) continue;
          const m = r.re.exec(path);
          if (!m) continue;
          req.params = Object.fromEntries(r.keys.map((k, n) => [k, decodeURIComponent(m[n + 1])]));
          try {
            r.handler(req, res, next);
          } catch (e) {
            resolve(fail(e));
          }
          return;
        }
        resolve({ status: 404, data: { error: 'Not found' } });
      };
      next();
    });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('/api')) return realFetch(input, init);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const { status, data } = await dispatch((init?.method ?? 'GET').toUpperCase(), url, body);
    // Photo URLs point at in-memory blobs.
    const text = JSON.stringify(data ?? { ok: true }).replace(/\/uploads\/([\w.-]+)/g, (m, name) => uploads.get(name) ?? m);
    return new Response(text, { status, headers: { 'content-type': 'application/json' } });
  };
}
