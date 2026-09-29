// Chat settings → Mark all as read (spec §B.4): reads each unread chat's newest page, one at a time, which
// is what marks it read on the server (the same as opening it), then marks it seen here.
export const MARK_ALL_MAX = 20;

export async function markAllRead({ ids, api, markSeen, onProgress = () => {}, toast, max = MARK_ALL_MAX }) {
  const todo = ids.slice(0, max);
  let marked = 0;
  onProgress(0, todo.length);
  for (let i = 0; i < todo.length; i += 1) {
    const r = await api.getChatMessages(todo[i], 1, 10);
    if (!r.ok && (r.kind === 'auth' || r.kind === 'busy')) {
      toast(r.kind === 'auth' ? 'Log in again to mark chats as read.' : 'Mail is unavailable right now. Try again later.', { error: true });
      return marked;
    }
    if (r.ok) {
      markSeen(todo[i]);
      marked += 1;
    }
    onProgress(i + 1, todo.length);
  }
  toast(`Marked ${marked} chat${marked === 1 ? '' : 's'} as read`);
  return marked;
}
