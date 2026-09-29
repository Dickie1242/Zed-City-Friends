// Release notes for the bottom of Chat settings (spec §D.2). Plain text, newest first. No badge or dot ever
// points at these: they're there for whoever opens settings.
export const WHATS_NEW = [
  {
    version: '0.7.0',
    date: '2026-09-29',
    features: [
      {
        title: 'Chat settings, reorganised',
        points: [
          'General, Chats and About tabs, with checkboxes and dropdowns that look like the game.',
          "Tap a chat in the Chats tab to lock it, change its text size, or put it back in the dock. One size can set every chat's text at once.",
          'Unmute chats from the Muted list.',
        ],
      },
      {
        title: 'Mentions',
        points: ['Messages in Global and Faction that say your name, or words you add, are highlighted. A mention sound can go with them.'],
      },
      {
        title: 'Sounds and time',
        points: ['A volume for the sounds, a Test button for desktop notifications, and a 12-hour clock.'],
      },
      {
        title: 'Your data',
        points: ['One backup file now holds your friends, enemies, notes and settings. Check for updates and restore default settings in About.'],
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-09-29',
    features: [
      {
        title: 'Never miss a message',
        points: [
          'Optional desktop notifications for new private messages (Chat settings), with a Friends only switch. With the game open in two tabs, only one of them speaks up.',
          "The browser tab's title shows your unread count, like (2) Zed City. You can turn it off in Chat settings.",
        ],
      },
      { title: 'Pinned chats', points: ['Pin conversations to the top of the Chats tab with the pin on each row.'] },
      { title: 'Phones', points: ['An open chat gets the full width, with every bubble on a row underneath.'] },
      {
        title: 'Chats',
        points: [
          "Every chat time shows Zed City time (ZCT), the game's own chats included. Rest the pointer on one (or tap it) for the full date and time in ZCT and in your own time zone (a Chat settings switch), and how long ago it was.",
          'Opening a DM with unread messages puts a "New" line above the first one.',
          'Moved chats that overlap: the one you click comes to the front.',
        ],
      },
      { title: 'Fixes', points: ['Smaller fixes for unblocking, the Faction tab, sounds, tablets and keyboard focus.'] },
    ],
  },
  {
    version: '0.5.x',
    date: '2026-09-29',
    features: [
      {
        title: 'Private Messages',
        points: [
          'The dock window is now Private Messages, with Chats, Friends, Faction and Blocked tabs.',
          'Search any player by name to start a chat. Older chats load as you scroll.',
        ],
      },
      {
        title: 'Enemies',
        points: [
          'An Enemies list beside Friends, with private notes, and Add Enemy on profiles.',
          "A red skull marks enemies in chats, including the game's Global, Faction and Activity.",
        ],
      },
      {
        title: 'Customize any chat',
        points: [
          'Unlock a chat with its padlock to drag it anywhere, resize it from its edges, then lock it there.',
          'Each chat keeps its own size, message size and spot. Right-click a padlock for its menu.',
        ],
      },
      {
        title: 'Chat settings and sounds',
        points: [
          'The cog in the corner: mark all as read, close all private chats, and reset any chat.',
          'An optional sound for new private messages.',
        ],
      },
      {
        title: 'Mute a conversation',
        points: ['The bell in a DM header stops its pop-ups, sound and green count.'],
      },
    ],
  },
  {
    version: '0.4.x',
    date: '2026-09-29',
    features: [
      { title: 'Friends page', points: ['A full Friends page from the top-bar icon, with level, status and faction.', 'Private notes on friends.'] },
      { title: 'Quieter dock', points: ['A plain top-bar icon, and a green unread count on the minimized window.'] },
    ],
  },
  {
    version: '0.3.x',
    date: '2026-09-28',
    features: [
      { title: 'Emoji picker', points: ['Pick emoji in DMs, Zed City ones included.'] },
      { title: 'Fixes', points: ['DM windows are no longer cut off at the bottom.'] },
    ],
  },
  {
    version: '0.2.x',
    date: '2026-09-28',
    features: [
      { title: 'GIFs', points: ['Send and see GIFs in DMs.'] },
      { title: 'Install link', points: ['One install link, with automatic updates.'] },
    ],
  },
  {
    version: '0.1.x',
    date: '2026-09-28',
    features: [
      { title: 'Friends and DMs', points: ['A friends list, DM windows in the chat dock, and Add Friend on profiles.'] },
    ],
  },
];
