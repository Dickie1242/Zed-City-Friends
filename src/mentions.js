// Mentions in the game's Global and Faction chats (0.7 spec §5.1): your name and the words you added, as
// whole words in any case ("@Moth", "moth," but not "mothball"). Pure.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// words: what to look for. Returns { test(text), ranges(text) } or null when there's nothing to look for.
export function makeMatcher(words) {
  const seen = new Set();
  const list = [];
  for (const w of Array.isArray(words) ? words : []) {
    const word = typeof w === 'string' ? w.trim() : '';
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    list.push(word);
  }
  if (!list.length) return null;
  list.sort((a, b) => b.length - a.length); // "Moth Man" before "Moth"
  const source = `(?<![\\p{L}\\p{N}_])(?:${list.map(escape).join('|')})(?![\\p{L}\\p{N}_])`;
  const once = new RegExp(source, 'iu');
  return {
    test: (text) => once.test(String(text)),
    // [start, end) pairs of every match in `text`.
    ranges(text) {
      const out = [];
      for (const m of String(text).matchAll(new RegExp(source, 'giu'))) out.push([m.index, m.index + m[0].length]);
      return out;
    },
  };
}
