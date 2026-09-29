// Desktop notifications for new private messages (0.6 spec §1.1). The player turns them on in Chat settings;
// nothing here asks for permission except request(), called from that click.
export function createNotifier({ win = window, onOpen = () => {} } = {}) {
  const N = win.Notification;
  const supported = typeof N === 'function';

  return {
    supported,
    permission: () => (supported ? N.permission : 'unsupported'),
    async request() {
      if (!supported) return 'unsupported';
      if (N.permission !== 'default') return N.permission;
      try {
        const answer = await N.requestPermission();
        return answer || N.permission;
      } catch {
        return N.permission;
      }
    },
    // One notification per player (the tag), so a newer message replaces the older one, and a second game
    // tab's copy replaces the first. A replacement comes quietly, without popping up again, unless
    // `renotify`. Returns the notification, or null when it can't be shown.
    show({ id, title, body, icon, tag = `zcf-dm-${id}`, renotify = false }) {
      if (!supported || N.permission !== 'granted') return null;
      let n;
      try {
        n = new N(title, renotify ? { body, icon, tag, renotify } : { body, icon, tag });
      } catch {
        return null;
      }
      n.onclick = () => {
        try {
          win.focus();
        } catch {
          // focusing can be refused; opening the DM still helps
        }
        if (id > 0) onOpen(id);
        n.close();
      };
      return n;
    },
    // Shown once when they're switched on. Some browsers (Chrome on Android) grant permission but refuse
    // page notifications, so this is also the check that they can appear at all.
    confirm() {
      return !!this.show({
        id: 0,
        title: 'Zed City Friends',
        body: "Desktop notifications are on. New private messages show up here while the game isn't in focus.",
        tag: 'zcf-on',
        renotify: true,
      });
    },
  };
}
