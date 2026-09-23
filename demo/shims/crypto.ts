export function randomBytes(n: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return { toString: () => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
export default { randomBytes };
