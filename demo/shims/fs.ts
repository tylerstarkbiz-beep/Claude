// Photo "files" live in memory as blob URLs for the life of the page.
export const uploads = new Map<string, string>();
const base = (p: string) => p.split('/').pop()!;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function mkdirSync() {}
export function existsSync(p: string) {
  return uploads.has(base(p));
}
export function writeFileSync(p: string, bytes: Uint8Array) {
  const name = base(p);
  const type = TYPES[name.split('.').pop()!] ?? 'application/octet-stream';
  uploads.set(name, URL.createObjectURL(new Blob([bytes as BlobPart], { type })));
}
export function rmSync(p: string) {
  const name = base(p);
  const url = uploads.get(name);
  if (url) URL.revokeObjectURL(url);
  uploads.delete(name);
}
export default { mkdirSync, existsSync, writeFileSync, rmSync };
