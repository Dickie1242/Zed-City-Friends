// Release notes for the bottom of Chat settings (spec §D.2). Plain text, newest first. No badge or dot ever
// points at these: they're there for whoever opens settings.
export const WHATS_NEW = [
  {
    version: '0.5.0',
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
