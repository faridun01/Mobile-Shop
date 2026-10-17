import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

interface TypeaheadInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Saved values containing the typed text (server search); merged with `options`. */
  fetchSuggestions?: (query: string) => Promise<string[]>;
  /** Static values filtered locally (e.g. common sizes), shown alongside the saved ones. */
  options?: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  id?: string;
  'aria-label'?: string;
  /** Called on Enter when no suggestion is highlighted (e.g. to move to the next field). */
  onEnter?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

const MAX_ITEMS = 8;

/**
 * A free-text field with suggestions that appear only while typing — never a list shown up front.
 * The list sits right under the field in a portal (so a scrolling form or a card never clips it,
 * and it flips above the field near the bottom of the screen), filters case-insensitively,
 * works with keyboard (↑ ↓ Enter Esc), mouse and touch, and choosing a value changes only this
 * field. A value not in the list is simply typed in.
 */
export const TypeaheadInput: React.FC<TypeaheadInputProps> = ({
  value,
  onChange,
  fetchSuggestions,
  options = [],
  placeholder,
  className,
  required,
  autoFocus,
  inputMode,
  id,
  onEnter,
  inputRef,
  ...rest
}) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [box, setBox] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean } | null>(null);
  const ownRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const requestRef = useRef(0);

  const setRefs = useCallback((node: HTMLInputElement | null) => {
    ownRef.current = node;
    if (typeof inputRef === 'function') inputRef(node);
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  }, [inputRef]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  // Suggestions for the typed text: local options at once, saved values after a short pause.
  const load = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setItems([]);
      close();
      return;
    }
    const local = options.filter((o) => o.toLowerCase().includes(q));
    const merge = (remote: string[]) => {
      const seen = new Set<string>();
      const merged = [...remote, ...local].filter((v) => {
        const key = v.trim().toLowerCase();
        if (!key || seen.has(key) || key === q) return false;
        seen.add(key);
        return true;
      });
      merged.sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)));
      setItems(merged.slice(0, MAX_ITEMS));
      setActive(-1);
      setOpen(merged.length > 0);
    };
    merge([]);
    if (!fetchSuggestions) return;
    const request = ++requestRef.current;
    window.setTimeout(() => {
      if (request !== requestRef.current) return;
      fetchSuggestions(query.trim())
        .then((remote) => { if (request === requestRef.current) merge(remote); })
        .catch(() => {});
    }, 150);
  };

  const place = useCallback(() => {
    const input = ownRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const below = viewportHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const showAbove = below < 160 && above > below;
    const maxHeight = Math.max(96, Math.min(240, showAbove ? above : below));
    const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    setBox({ left, top: showAbove ? rect.top - 4 : rect.bottom + 4, width, maxHeight, above: showAbove });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    window.visualViewport?.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      window.visualViewport?.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  // A value set from outside (a scan, a reset) never opens the list.
  useEffect(() => {
    if (document.activeElement !== ownRef.current) close();
  }, [value]);

  const choose = (item: string) => {
    onChange(item);
    requestRef.current++;
    close();
  };

  return (
    <>
      <input
        ref={setRefs}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={rest['aria-label']}
        required={required}
        autoFocus={autoFocus}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={cn('w-full', className)}
        onChange={(e) => {
          onChange(e.target.value);
          load(e.target.value);
        }}
        onBlur={() => {
          requestRef.current++;
          close();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && items.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === 'ArrowUp' && items.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === 'Enter') {
            if (open && active >= 0 && items[active]) {
              e.preventDefault();
              choose(items[active]);
            } else if (onEnter) {
              e.preventDefault();
              close();
              onEnter();
            } else {
              close();
            }
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      />
      {open && box && items.length > 0 && createPortal(
        <ul
          id={listId}
          role="listbox"
          className="fixed z-200 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg py-1 text-xs"
          style={{
            left: box.left,
            width: box.width,
            maxHeight: box.maxHeight,
            ...(box.above ? { bottom: window.innerHeight - box.top } : { top: box.top }),
          }}
        >
          {items.map((item, index) => (
            <li
              key={item}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Keep the field focused (no blur closing the list first), then pick on click/tap.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                'px-3 py-2 cursor-pointer truncate min-h-9 flex items-center',
                index === active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-surface-raised'
              )}
            >
              {item}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
};
