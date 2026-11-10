import type { MdMenu } from '@material/web/menu/menu.js';

export interface MenuItem {
  label: string;
  icon: string; // Material Symbols name
  shortcut?: string;
  enabled: boolean;
  danger?: boolean;
  action: () => void;
}

// The right-click menu, an M3 <md-menu>. open(x, y, items) shows it at a
// screen point. md-menu closes itself on choosing an item, pressing outside
// or Esc; scrolling and resizing close it too.
export function createMenu(menu: MdMenu, anchor: HTMLElement) {
  function close() {
    menu.close();
  }

  function open(x: number, y: number, items: (MenuItem | 'separator')[]) {
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
