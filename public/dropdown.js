function positionPopover(popover, trigger) {
  const rect = trigger.getBoundingClientRect();
  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  const popWidth = popover.offsetWidth || 320;
  let left = rect.right + window.scrollX - popWidth;
  if (left < 8) left = 8;
  popover.style.left = `${left}px`;
}

export function createDropdown({ trigger, popover, onOpen, onClose }) {
  let open = false;

  function close() {
    if (!open) return;
    open = false;
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocMouseDown, true);
    document.removeEventListener('keydown', onDocKey);
    onClose?.();
  }

  function openIt() {
    if (open) return;
    open = true;
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionPopover(popover, trigger);
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onDocKey);
    onOpen?.();
  }

  function onDocMouseDown(ev) {
    if (popover.contains(ev.target) || trigger.contains(ev.target)) return;
    close();
  }
  function onDocKey(ev) { if (ev.key === 'Escape') close(); }

  trigger.addEventListener('click', () => (open ? close() : openIt()));
  return { open: openIt, close, isOpen: () => open };
}
