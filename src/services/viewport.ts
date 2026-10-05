/** Keep fixed UI inside the visible viewport, including a software keyboard.
 * Pinch zoom must remain a browser operation, not trigger a layout reflow.
 */
export function initViewport(): () => void {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  // Fallback for the app shell height where dvh is unsupported (see .app-viewport in index.css).
  root.classList.toggle('no-dvh', !(window.CSS?.supports?.('height', '100dvh') ?? false));
  let frame = 0;
  let baseHeight = window.innerHeight;
  let lastWidth = window.innerWidth;

  const onOrientation = () => {
    baseHeight = window.innerHeight;
    lastWidth = window.innerWidth;
    update();
  };

  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;

      // Handle orientation change or window resize when not editing
      if (Math.abs(window.innerWidth - lastWidth) > 50) {
        lastWidth = window.innerWidth;
        baseHeight = window.innerHeight;
      }

      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      root.style.setProperty('--app-height', `${window.innerHeight}px`);
      root.style.setProperty('--app-viewport-height', `${height}px`);
      root.style.setProperty('--app-viewport-top', `${top}px`);
      root.style.setProperty('--app-viewport-bottom', `${Math.max(0, window.innerHeight - height - top)}px`);

      const editing = Boolean(document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'));
      if (!editing) {
        baseHeight = Math.max(baseHeight, window.innerHeight, height);
      }

      const isKeyboardOpen = editing && ((window.innerHeight - height > 80) || (baseHeight - height > 80));
      root.toggleAttribute('data-keyboard-open', isKeyboardOpen);

      if (window.scrollY > 0) {
        window.scrollTo(0, 0);
      }

      if (editing && isKeyboardOpen) {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl && typeof activeEl.scrollIntoView === 'function') {
          setTimeout(() => {
            if (document.activeElement === activeEl) {
              activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
          }, 60);
        }
      }
    });
  };
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', onOrientation);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', onOrientation);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
  };
}
