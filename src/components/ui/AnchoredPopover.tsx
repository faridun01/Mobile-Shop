import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchor: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
  className?: string;
  role?: React.AriaRole;
  id?: string;
}

/** Escape scroll clipping while keeping popups inside their owning modal's focus boundary. */
export function AnchoredPopover({ anchor, children, onClose, width, className, role, id }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [host, setHost] = useState<Element | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    setHost(anchor.current?.closest('[data-modal-layer]') ?? document.body);
  }, [anchor]);
  useLayoutEffect(() => {
    if (!host || !anchor.current || !ref.current) return;
    const popup = ref.current;
    let frame = 0;
    const update = () => {
      const a = anchor.current;
      if (!a) return;
      const rect = a.getBoundingClientRect();
      const vv = window.visualViewport;
      const top = (vv?.offsetTop ?? 0) + 8;
      const bottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight) - 8;
      const left = (vv?.offsetLeft ?? 0) + 8;
      const viewportWidth = vv?.width ?? window.innerWidth;
      const popupWidth = Math.min(width ?? rect.width, viewportWidth - 16);
      const below = Math.max(0, bottom - rect.bottom - 4);
      const above = Math.max(0, rect.top - top - 4);
      const desired = Math.min(popup.scrollHeight, 320);
      const useAbove = below < desired && above > below;
      const maxHeight = Math.max(0, useAbove ? above : below);
      setStyle({
        width: popupWidth, maxHeight,
        left: Math.max(left, Math.min(rect.left, left + viewportWidth - 16 - popupWidth)),
        top: useAbove ? Math.max(top, rect.top - 4 - Math.min(desired, maxHeight)) : Math.max(top, rect.bottom + 4),
        visibility: 'visible',
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const outside = (event: PointerEvent) => {
      if (!popup.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) closeRef.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
        anchor.current?.querySelector<HTMLElement>('input,button')?.focus({ preventScroll: true });
      }
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(popup);
    observer.observe(anchor.current);
    update();
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key, true);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key, true);
    };
  }, [host, anchor, width]);
  return host && createPortal(<div ref={ref} id={id} role={role} style={style} className={`anchored-popover ${className ?? ''}`}>{children}</div>, host);
}
