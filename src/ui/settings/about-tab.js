// Chat settings → About (0.7 spec Part 4): the version and Check for updates, a short What's new, your data
// (backup, restore defaults) and the dev's profile link.
import { h } from '../dom.js';
import { section } from './controls.js';
import { WHATS_NEW } from '../../whats-new.js';
import { VERSION, DEV_PROFILE_ID, UPDATE_URL } from '../../version.js';
import { checkForUpdate } from '../../update-check.js';

// backup: ui/backup-file.js
export function createAboutTab({ services, requestRender, backup }) {
  const { actions, router, toast } = services;
  let update = { status: 'idle' };
  const openFeatures = new Set(); // "version:index"
  let showOlder = false;
  let confirming = false;

  async function check() {
    if (update.status === 'checking') return;
    update = { status: 'checking' };
    requestRender();
    const opts = { current: VERSION };
    if (services.fetchImpl) opts.fetchImpl = services.fetchImpl;
    update = await checkForUpdate(opts);
    requestRender();
  }

  const model = () => ({ update, open: [...openFeatures], showOlder, confirming });

  function updateStatus() {
    if (update.status === 'checking') return h('span', { class: 'zcf-set-upd' }, 'Checking…');
    if (update.status === 'current') return h('span', { class: 'zcf-set-upd zcf-set-ok' }, h('i', { class: 'fas fa-check', 'aria-hidden': 'true' }), " You're up to date");
    if (update.status === 'newer') {
      return h('span', { class: 'zcf-set-upd zcf-set-new' }, `v${update.latest} is out · `,
        h('a', { class: 'zcf-set-link', href: UPDATE_URL, target: '_blank', rel: 'noopener', 'data-zcf-focus': 'update-now' }, 'Update now'));
    }
    if (update.status === 'failed') return h('span', { class: 'zcf-set-upd zcf-set-fail' }, "Couldn't check. Try again later.");
    return null;
  }

  function features(v) {
    return v.features.map((f, i) => {
      const id = `${v.version}:${i}`;
      const open = openFeatures.has(id);
      return [
        h('button', {
          class: 'zcf-set-feat',
          type: 'button',
          'aria-expanded': String(open),
          'data-zcf-focus': `feat:${id}`,
          onclick: () => {
            if (open) openFeatures.delete(id);
            else openFeatures.add(id);
            requestRender();
          },
        }, h('span', { class: 'zcf-grow' }, f.title), h('i', { class: `fas fa-chevron-${open ? 'down' : 'right'}`, 'aria-hidden': 'true' })),
        open ? h('ul', { class: 'zcf-set-points' }, f.points.map((p) => h('li', null, p))) : null,
      ];
    });
  }

  // A plain left click navigates in-app; middle and modified clicks open the profile in a new tab.
  function devLink() {
    if (!DEV_PROFILE_ID) return null;
    const href = `/profile/${DEV_PROFILE_ID}`;
    return h('a', {
      class: 'zcf-set-dev',
      href,
      'data-zcf-focus': 'dev',
      onclick: (e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.navigate(href);
      },
    }, h('i', { class: 'fas fa-user-plus', 'aria-hidden': 'true' }), ' Become friends or enemies with the dev!');
  }

  function restoreControls() {
    if (!confirming) {
      return h('button', {
        class: 'zcf-page-btn zcf-page-danger',
        type: 'button',
        'data-zcf-focus': 'restore',
        onclick: () => {
          confirming = true;
          requestRender();
        },
      }, 'Restore default settings');
    }
    return h('div', { class: 'zcf-set-confirm' },
      h('span', null, 'Put every setting back to how it came?'),
      h('button', {
        class: 'zcf-page-btn zcf-page-danger',
        type: 'button',
        'data-zcf-focus': 'restore-yes',
        onclick: () => {
          confirming = false;
          actions.restoreDefaults();
          toast('Settings are back to how they came.');
          requestRender();
        },
      }, 'Restore'),
      h('button', {
        class: 'zcf-page-btn',
        type: 'button',
        'data-zcf-focus': 'restore-no',
        onclick: () => {
          confirming = false;
          requestRender();
        },
      }, 'Cancel'));
  }

  function build() {
    const [latest, ...older] = WHATS_NEW;
    return [
      section(null,
        h('div', { class: 'zcf-set-about' }, `Zed City Friends v${VERSION}`),
        h('div', { class: 'zcf-set-line' },
          h('button', { class: 'zcf-mini', type: 'button', 'data-zcf-focus': 'check', disabled: update.status === 'checking', onclick: check }, 'Check for updates'),
          updateStatus())),
      section({ icon: 'star', label: `What's new in ${latest.version}` },
        features(latest),
        older.length
          ? h('button', {
            class: 'zcf-news-toggle',
            type: 'button',
            'aria-expanded': String(showOlder),
            'data-zcf-focus': 'older',
            onclick: () => {
              showOlder = !showOlder;
              requestRender();
            },
          }, `Earlier versions ${showOlder ? '▾' : '▸'}`)
          : null,
        showOlder ? older.map((v) => [h('div', { class: 'zcf-news-vh' }, `v${v.version}`, h('span', { class: 'zcf-news-date' }, v.date)), features(v)]) : null),
      section({ icon: 'save', label: 'Your data' },
        h('div', { class: 'zcf-set-hint' }, 'Friends, enemies, notes and these settings, in one file.'),
        h('div', { class: 'zcf-set-btns' },
          h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'save', onclick: () => backup.save() }, 'Save backup'),
          h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'load', onclick: () => backup.load() }, 'Load backup')),
        restoreControls(),
        h('div', { class: 'zcf-set-hint' }, 'Keeps your friends, enemies, pins and mutes.')),
      section(null, devLink()),
    ];
  }

  return {
    model,
    build,
    // The update result lasts until the window closes.
    reset() {
      update = { status: 'idle' };
      confirming = false;
    },
  };
}
