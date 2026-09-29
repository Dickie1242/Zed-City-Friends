// Save backup / Load backup (0.7 spec §4.3): one file with friends, enemies, notes and settings, from Chat
// settings → About and from the Private Messages ⋯ menu. The caller puts `input` (a hidden file picker)
// inside its window.
import { h, downloadText } from './dom.js';
import { importMessage } from '../backup.js';
import { safe } from '../util.js';

export const MAX_IMPORT_BYTES = 1024 * 1024;

// actions: { exportBackup(), importBackup(text) }
export function createBackupFile({ doc = document, actions, toast, playerId }) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', safe('backup-load', async () => {
    const file = input.files && input.files[0];
    input.value = ''; // let the same file be picked again, whatever happens below
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast('That file is too large to be a backup.', { error: true });
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      toast("Couldn't read that file.", { error: true });
      return;
    }
    const res = actions.importBackup(text);
    toast(res.ok ? importMessage(res) : res.error, { error: !res.ok });
  }));

  return {
    input,
    save() {
      downloadText(`zed-city-friends-${playerId}.json`, actions.exportBackup(), doc);
      toast('Backup saved: friends, enemies, notes and settings.');
    },
    load() {
      input.click();
    },
  };
}
