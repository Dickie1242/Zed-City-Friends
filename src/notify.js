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
    // tab's copy replaces the first. Returns the notification, or null when it can't be shown.
    show({ id, title, body, icon }) {
      if (!supported || N.permission !== 'granted') return null;
      let n;
      try {
        n = new N(title, { body, icon, tag: `zcf-dm-${id}` });
      } catch {
        return null;
      }
      n.onclick = () => {
        try {
          win.focus();
        } catch {
          // focusing can be refused; opening the DM still helps
        }
        onOpen(id);
        n.close();
      };
      return n;
    },
  };
}
