/** Keep fixed UI inside the visible viewport, including a software keyboard.
 * Pinch zoom must remain a browser operation, not trigger a layout reflow.
 */
export function initViewport(): () => void {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      root.style.setProperty('--app-viewport-height', `${height}px`);
      root.style.setProperty('--app-viewport-top', `${top}px`);
      root.style.setProperty('--app-viewport-bottom', `${Math.max(0, window.innerHeight - height - top)}px`);
      const editing = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
      root.toggleAttribute('data-keyboard-open', !!editing && window.innerHeight - height > 120);
    });
  };
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
  };
}
