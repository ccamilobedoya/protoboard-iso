// The bar's ⋯ menu and the first-time hint (UX pass, U3).
//
// The menu holds what is used less (dot speed, Falstad, the hint again, the revision). It opens
// under its button, takes the arrow keys, Home and End, and closes on Escape, a tap outside or a
// choice; focus goes back to the button. Other modules add items with page.menuAdd(el).
//
// The hint says what can be tapped and how to move (alone or inside a note, see view.js). It shows
// the first time a page of the kit is opened in this browser (remembered when storage is allowed)
// and goes away at the first touch; "What can I tap?" in the menu shows it again.

const HINT_SEEN = 'protoboard-iso:hint-seen';

function remembered(win) {
  try {
    return win.localStorage.getItem(HINT_SEEN) === '1';
  } catch {
    return false;
  }
}
function remember(win) {
  try {
    win.localStorage.setItem(HINT_SEEN, '1');
  } catch {
    // private window or blocked storage: the hint shows again next time
  }
}

export function setupBar(page) {
  const doc = page.main.ownerDocument;
  const win = doc.defaultView;
  const more = doc.querySelector('nav .more-button');
  const menu = doc.querySelector('nav .menu');
  const hint = doc.querySelector('.first-hint');
  if (!more || !menu) return;

  const items = () => [...menu.querySelectorAll('[role^="menuitem"], a')].filter((el) => !el.hidden && !el.closest('[hidden]'));
  const open = (focusFirst) => {
    menu.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    if (focusFirst) items()[0]?.focus();
  };
  const close = (refocus) => {
    if (menu.hidden) return;
    menu.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    if (refocus) more.focus();
  };
  more.addEventListener('click', (e) => (menu.hidden ? open(e.detail === 0) : close(false)));
  more.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && menu.hidden) {
      e.preventDefault();
      open(true);
    }
  });
  menu.addEventListener('keydown', (e) => {
    const list = items();
    const k = list.indexOf(doc.activeElement);
    const go = (i) => list[(i + list.length) % list.length]?.focus();
    if (e.key === 'Escape') close(true);
    else if (e.key === 'ArrowDown') go(k + 1);
    else if (e.key === 'ArrowUp') go(k - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else return;
    e.preventDefault();
  });
  // A choice closes the menu (after its own handler); a tap anywhere else too.
  menu.addEventListener('click', (e) => {
    if (e.target.closest('[role^="menuitem"], a')) setTimeout(() => close(false), 0);
  });
  doc.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !more.contains(e.target)) close(false);
  });
  page.menuAdd = (el, before = menu.querySelector('.again')) => menu.insertBefore(el, before);

  // The first-time hint.
  if (!hint) return;
  const hide = () => {
    hint.hidden = true;
    remember(win);
  };
  hint.hidden = remembered(win);
  page.main.addEventListener('pointerdown', () => {
    if (!hint.hidden) hide();
  });
  menu.querySelector('.again')?.addEventListener('click', () => {
    hint.hidden = false;
  });
}
