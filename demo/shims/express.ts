// Just enough of Express's Router for the API modules: method routes with :params, next(), next(err).
type Handler = (req: any, res: any, next: (err?: unknown) => void) => void;
export interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  handler: Handler;
}

export function Router() {
  const routes: Route[] = [];
  const add = (method: string) => (path: string, ...handlers: Handler[]) => {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    for (const handler of handlers) routes.push({ method, re, keys, handler });
  };
  return { routes, get: add('GET'), post: add('POST'), patch: add('PATCH'), put: add('PUT'), delete: add('DELETE') };
}

export type DemoRouter = ReturnType<typeof Router>;
export type Request = any;
export type Response = any;
export type NextFunction = (err?: unknown) => void;
export default { Router };
