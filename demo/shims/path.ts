const clean = (s: string) => s.replace(/\/+/g, '/');
export const join = (...parts: string[]) => clean(parts.join('/'));
export const resolve = join;
export const dirname = (p: string) => p.split('/').slice(0, -1).join('/') || '/';
export default { join, resolve, dirname };
