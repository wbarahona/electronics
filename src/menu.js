// The right-click menu, an M3 <md-menu>. open(x, y, items) shows it at a
// screen point; items are { label, icon, shortcut?, enabled, danger?, action }
// or 'separator'. md-menu closes itself on choosing an item, pressing outside
// or Esc; scrolling and resizing close it too.
export function createMenu(menu, anchor) {
  function close() {
    menu.close();
  }

  function open(x, y, items) {
    menu.replaceChildren(
      ...items.map((item) => {
        if (item === 'separator') {
          const divider = document.createElement('md-divider');
          divider.setAttribute('role', 'separator');
          divider.tabIndex = -1;
          return divider;
        }
        const entry = document.createElement('md-menu-item');
        entry.disabled = !item.enabled;
        entry.classList.toggle('danger', !!item.danger);
        const icon = document.createElement('md-icon');
        icon.slot = 'start';
        icon.textContent = item.icon;
        const label = document.createElement('div');
        label.slot = 'headline';
        label.textContent = item.label;
        entry.append(icon, label);
        if (item.shortcut) {
          const shortcut = document.createElement('div');
          shortcut.slot = 'trailing-supporting-text';
          shortcut.textContent = item.shortcut;
          entry.append(shortcut);
        }
        entry.addEventListener('click', () => {
          if (!entry.disabled) item.action();
        });
        return entry;
      }),
    );
    anchor.style.left = `${x}px`;
    anchor.style.top = `${y}px`;
    menu.show();
  }

  window.addEventListener('wheel', close, { passive: true });
  window.addEventListener('resize', close);

  return { open, close };
}
