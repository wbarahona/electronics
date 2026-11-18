// A short fingerprint of a text (FNV-1a, 32 bits, base 36): what a
// translation keeps of the English it was made from, so a change to the
// English shows which translations are out of date (npm run i18n:check).
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// The same for a part's About this part, all three of its texts together.
export const aboutFingerprint = (a: { how: string; sim: string; uses: string }) => fingerprint(`${a.how}\n${a.sim}\n${a.uses}`);
