import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatNames } from '../../src/ui/chat-names.js';
import { addFriend } from '../../src/state.js';
import { DOCK_HTML } from '../fixtures/game-dom.js';
import { makeServices } from './services.js';
import { flush } from '../helpers.js';

function hover(name) {
  const el = [...document.querySelectorAll('.sender-name')].find((n) => n.textContent === name);
  el.parentElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return el;
}

describe('chat names', () => {
  let chat;
  let services;
  beforeEach(() => {
    document.body.innerHTML = DOCK_HTML;
    services = makeServices();
    chat = createChatNames({ ...services, myName: 'Me' });
    services.store.subscribe(() => chat.refresh());
    chat.start();
  });
  afterEach(() => chat.stop());

  it('shows "+ friend" after the hovered sender name', () => {
    const name = hover('Gravedigger');
    expect(name.nextSibling).toBe(chat.button);
    hover('Nyx');
    expect(document.querySelectorAll('.zcf-addname')).toHaveLength(1);
  });

  it('hides it for your own messages and for existing friends', () => {
    hover('Gravedigger');
    hover('Me');
    expect(chat.button.isConnected).toBe(false);
    services.store.update((s) => addFriend(s, { id: 3, username: 'nyx' }, 0));
    hover('Nyx');
    expect(chat.button.isConnected).toBe(false);
  });

  it('ignores our own DM windows', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="chat-container zcf"><div class="msg-cont"><span class="sender-name">Spike</span></div></div>');
    hover('Spike');
    expect(chat.button.isConnected).toBe(false);
  });

  it('adds the exact match found by name', async () => {
    services.players.resolveExact = vi.fn().mockResolvedValue({ id: 3, username: 'Nyx', avatar: null });
    hover('Nyx');
    chat.button.click();
    await flush();
    expect(services.players.resolveExact).toHaveBeenCalledWith('Nyx');
    expect(services.store.get().friends[3].username).toBe('Nyx');
    expect(services.toast).toHaveBeenCalledWith('Nyx added to friends');
  });

  it('reports names it cannot find', async () => {
    services.players.resolveExact = vi.fn().mockResolvedValue(null);
    hover('Gravedigger');
    chat.button.click();
    await flush();
    expect(services.toast).toHaveBeenCalledWith("Couldn't find Gravedigger", { error: true });
    expect(services.store.get().friends).toEqual({});
  });
});
