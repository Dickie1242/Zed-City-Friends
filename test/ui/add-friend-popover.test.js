import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAddFriendPopover } from '../../src/ui/add-friend-popover.js';

function setup(opts = {}) {
  const added = new Set([8]);
  const players = { search: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 7, username: 'ZombieKing', avatar: null }, { id: 8, username: 'Zombo', avatar: null }] }) };
  const onAdd = vi.fn((p) => added.add(p.id));
  const onClose = vi.fn();
  const pop = createAddFriendPopover({ players, isAdded: (id) => added.has(id), onAdd, onClose, ...opts });
  document.body.innerHTML = '';
  document.body.appendChild(pop.el);
  return { pop, players, onAdd, onClose };
}

describe('add pop-out', () => {
  afterEach(() => vi.useRealTimers());

  it('finds players, adds one, marks those already added, and closes on Esc', async () => {
    vi.useFakeTimers();
    const { pop, players, onAdd, onClose } = setup();
    pop.open();
    expect(pop.isOpen).toBe(true);
    pop.input.value = 'zo';
    pop.input.dispatchEvent(new Event('input'));
    expect(pop.el.textContent).toContain('Searching…');
    await vi.advanceTimersByTimeAsync(300);
    expect(players.search).toHaveBeenCalledWith('zo');
    const rows = [...pop.el.querySelectorAll('.zcf-result')];
    expect(rows.map((r) => r.querySelector('.zcf-name').textContent)).toEqual(['ZombieKing', 'Zombo']);
    expect(rows[1].textContent).toContain('✓ Friend');
    rows[0].querySelector('.zcf-add').click();
    expect(onAdd).toHaveBeenCalledWith({ id: 7, username: 'ZombieKing', avatar: null });
    expect(pop.el.querySelector('.zcf-result').textContent).toContain('✓ Friend');
    pop.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pop.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('can be relabelled for another list', async () => {
    vi.useFakeTimers();
    const { pop } = setup();
    pop.setLabels({ title: 'Add enemy', doneText: '✓ Enemy' });
    pop.open();
    expect(pop.el.querySelector('.zcf-pop-title').textContent).toBe('Add enemy');
    pop.input.value = 'zo';
    pop.input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect(pop.el.querySelectorAll('.zcf-result')[1].textContent).toContain('✓ Enemy');
  });
});
