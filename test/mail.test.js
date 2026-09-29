import { describe, it, expect } from 'vitest';
import {
  messageText,
  messageParts,
  previewText,
  normalizeMessages,
  normalizeThreads,
  buildLog,
  findNewMail,
  reconcilePending,
} from '../src/mail.js';
import { rawMsg, rawThread } from './helpers.js';

describe('mail', () => {
  it('turns object messages into readable text', () => {
    expect(messageText('hey')).toBe('hey');
    expect(messageText({ cmd: 'tradeInvite' })).toBe('Sent a trade invite');
    expect(messageText({ cmd: 'activityInvite' })).toBe('Sent an activity invite');
    expect(messageText({ cmd: 'mystery' })).toBe('Sent a message that can only be viewed in the inbox');
    expect(messageText(null)).toBe('');
  });

  it('normalizes messages and drops rows without an id', () => {
    const out = normalizeMessages([rawMsg(5, 2, 'a', '2026-09-28 10:00:00'), { message: 'no id' }]);
    expect(out).toEqual([{ id: 5, senderId: 2, text: 'a', ts: Date.UTC(2026, 8, 28, 10), isSystem: false }]);
  });

  it('treats a string "0" is_system as false, not truthy', () => {
    const out = normalizeMessages([
      { id: '5', sender_id: '2', message: 'a', sent_at: '2026-09-28 10:00:00', is_system: '0' },
    ]);
    expect(out).toEqual([{ id: 5, senderId: 2, text: 'a', ts: Date.UTC(2026, 8, 28, 10), isSystem: false }]);
  });

  it('treats a string "0" is_system on a thread as false, and keeps string new_mail working', () => {
    const [t] = normalizeThreads([{ ...rawThread(10, { newMail: '1' }), is_system: '0' }]);
    expect(t).toMatchObject({ isSystem: false, newMail: 1 });
  });

  it('treats is_system "1", 1 and true as true', () => {
    const [a, b, c] = normalizeMessages([
      rawMsg(1, 2, 'a', '2026-09-28 10:00:00'),
      rawMsg(2, 2, 'b', '2026-09-28 10:00:00'),
      rawMsg(3, 2, 'c', '2026-09-28 10:00:00'),
    ].map((m, i) => ({ ...m, is_system: ['1', 1, true][i] })));
    expect([a.isSystem, b.isSystem, c.isSystem]).toEqual([true, true, true]);
  });

  it('normalizes thread rows, including boolean or numeric new_mail', () => {
    const [a, b, c] = normalizeThreads({
      0: rawThread(10, { newMail: 3 }),
      1: rawThread(11, { newMail: true }),
      2: { ...rawThread(12), other_user: null, new_mail: 0 },
    });
    expect(a).toMatchObject({ userId: 10, username: 'User10', newMail: 3, preview: 'hi', avatar: null });
    expect(b.newMail).toBe(1);
    expect(c).toMatchObject({ userId: 12, username: '#12', newMail: 0 });
  });

  it('builds a log with day dividers and 15-minute same-sender grouping', () => {
    const msgs = normalizeMessages([
      rawMsg(3, 2, 'c', '2026-09-28 10:10:00'),
      rawMsg(1, 2, 'a', '2026-09-27 23:59:00'),
      rawMsg(2, 2, 'b', '2026-09-28 10:00:00'),
      rawMsg(4, 1, 'd', '2026-09-28 10:21:00'),
      rawMsg(5, 1, 'e', '2026-09-28 10:40:00'),
      rawMsg(2, 2, 'b', '2026-09-28 10:00:00'),
    ]);
    const log = buildLog(msgs);
    expect(log.map((i) => i.key)).toEqual(['d:2026-09-27', 'm:1', 'd:2026-09-28', 'm:2', 'm:3', 'm:4', 'm:5']);
    expect(log[0].label).toBe('September 27, 2026');
    const grouped = Object.fromEntries(log.filter((i) => i.type === 'msg').map((i) => [i.msg.id, i.grouped]));
    expect(grouped).toEqual({ 1: false, 2: false, 3: true, 4: false, 5: false });
  });

  it('does not group same-sender messages that cross a UTC day boundary, even within the window', () => {
    const msgs = normalizeMessages([
      rawMsg(1, 2, 'a', '2026-09-27 23:55:00'),
      rawMsg(2, 2, 'b', '2026-09-28 00:05:00'),
    ]);
    const log = buildLog(msgs);
    expect(log.map((i) => i.key)).toEqual(['d:2026-09-27', 'm:1', 'd:2026-09-28', 'm:2']);
    expect(log.find((i) => i.key === 'm:2').grouped).toBe(false);
  });

  it('finds unread mail newer than what was seen, from the other person only', () => {
    const threads = normalizeThreads([
      rawThread(10, { newMail: 1, lastReply: '2026-09-28 12:00:00' }),
      rawThread(11, { newMail: 1, senderId: 1 }),
      rawThread(12, { newMail: 1, isSystem: 1 }),
      rawThread(13, { newMail: 0 }),
      rawThread(14, { newMail: 2, lastReply: '2026-09-28 12:00:00' }),
    ]);
    const seen = { 14: { lastSeenReply: Date.UTC(2026, 8, 28, 12) } };
    expect(findNewMail(threads, seen, 1).map((t) => t.userId)).toEqual([10]);
  });

  it('returns a thread seen before if there is newer mail since', () => {
    const threads = normalizeThreads([rawThread(10, { newMail: 1, lastReply: '2026-09-28 12:00:00' })]);
    const seen = { 10: { lastSeenReply: Date.UTC(2026, 8, 28, 11) } };
    expect(findNewMail(threads, seen, 1).map((t) => t.userId)).toEqual([10]);
  });

  it('drops pending messages once their server copy arrives', () => {
    const pending = [{ localId: 1, realId: 50 }, { localId: 2, realId: null }, { localId: 3, realId: 60 }];
    expect(reconcilePending(pending, [{ id: 50 }]).map((p) => p.localId)).toEqual([2, 3]);
  });
});

describe('messageParts', () => {
  const gif = (path) => 'https://cdn.zed.city/?url=' + encodeURIComponent(`https://static.klipy.com/${path}`);

  it('turns a plain GIF into a single image part', () => {
    const src = gif('ii/4493325008d34b7bf8cd6813cd5c1619/d3/19/Wgu8FhZhblHegj8J.gif');
    expect(messageParts(`![Bibi Impressed](${src})`)).toEqual([{ type: 'image', alt: 'Bibi Impressed', src }]);
  });

  it('keeps text around a GIF', () => {
    const src = gif('a.gif');
    expect(messageParts(`brooo\n![hi](${src})\nthanks`)).toEqual([
      { type: 'text', text: 'brooo\n' },
      { type: 'image', alt: 'hi', src },
      { type: 'text', text: '\nthanks' },
    ]);
  });

  it('handles two GIFs back to back', () => {
    const a = gif('a.gif');
    const b = gif('b.gif');
    expect(messageParts(`![a](${a})![b](${b})`)).toEqual([
      { type: 'image', alt: 'a', src: a },
      { type: 'image', alt: 'b', src: b },
    ]);
  });

  it('leaves a non-proxy URL as text', () => {
    expect(messageParts('![x](https://evil.example/a.gif)')).toEqual([{ type: 'text', text: '![x](https://evil.example/a.gif)' }]);
  });

  it('leaves a javascript: URL as text', () => {
    expect(messageParts('![x](javascript:alert(1))')).toEqual([{ type: 'text', text: '![x](javascript:alert(1))' }]);
  });

  it('leaves a non-https proxy URL as text', () => {
    expect(messageParts('![x](http://cdn.zed.city/a.gif)')).toEqual([{ type: 'text', text: '![x](http://cdn.zed.city/a.gif)' }]);
  });

  it('leaves a URL containing a space or a quote as text', () => {
    expect(messageParts('![x](https://cdn.zed.city/a b.gif)')).toEqual([{ type: 'text', text: '![x](https://cdn.zed.city/a b.gif)' }]);
    expect(messageParts("![x](https://cdn.zed.city/a'b.gif)")).toEqual([{ type: 'text', text: "![x](https://cdn.zed.city/a'b.gif)" }]);
  });

  it('returns a single text part when there is no Markdown', () => {
    expect(messageParts('just a normal message')).toEqual([{ type: 'text', text: 'just a normal message' }]);
  });
});

describe('previewText', () => {
  it('replaces an allowed GIF embed with "GIF: <alt>"', () => {
    const src = 'https://cdn.zed.city/?url=' + encodeURIComponent('https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/d3/19/Wgu8FhZhblHegj8J.gif');
    expect(previewText(`![Bibi Impressed](${src})`)).toBe('GIF: Bibi Impressed');
  });

  it('keeps surrounding text and collapses whitespace', () => {
    const src = 'https://cdn.zed.city/?url=' + encodeURIComponent('https://static.klipy.com/a.gif');
    expect(previewText(`brooo\n![hi](${src})\nthanks`)).toBe('brooo GIF: hi thanks');
  });

  it('leaves a non-proxy embed as-is', () => {
    expect(previewText('![x](https://evil.example/a.gif)')).toBe('![x](https://evil.example/a.gif)');
  });

  it('feeds normalizeThread\'s preview', () => {
    const src = 'https://cdn.zed.city/?url=' + encodeURIComponent('https://static.klipy.com/a.gif');
    const [t] = normalizeThreads([rawThread(10, { message: `![hi](${src})` })]);
    expect(t.preview).toBe('GIF: hi');
  });
});
