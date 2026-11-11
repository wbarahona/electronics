// Share by link: the whole circuit file, deflated and base64url-encoded, in
// the URL's fragment (#c=…). The fragment never reaches a server, so a link
// works wherever the app is hosted and nothing is uploaded.

export const LINK_KEY = 'c';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// A link to this page that opens `text` (a circuit file).
export async function linkFor(text: string): Promise<string> {
  const packed = toBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')));
  const url = new URL(location.href);
  url.hash = `${LINK_KEY}=${packed}`;
  return url.href;
}

// The circuit file in this page's link, if it has one. Throws if it's there
// but damaged (cut short when copied, say).
export async function circuitInLink(): Promise<string | null> {
  const packed = new URLSearchParams(location.hash.slice(1)).get(LINK_KEY);
  if (!packed) return null;
  return new TextDecoder().decode(await pipe(fromBase64Url(packed), new DecompressionStream('deflate-raw')));
}

// Take the circuit out of the address bar once opened, so a reload keeps
// later edits (from the autosave) rather than reopening the link.
export function clearLink() {
  history.replaceState(null, '', location.pathname + location.search);
}
