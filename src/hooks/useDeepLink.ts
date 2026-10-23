import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Opens the record a notification links to, e.g. /transfer?transfer=<id>: once the page is
 * `ready` (its data loaded), `open` gets the parameter's value. The parameter then leaves the
 * address, so going back or refreshing does not open the record again; a new link opens anew.
 * `companions`: other parameters of the same link (e.g. the store), read by `open` and removed too.
 */
export function useDeepLink(
  param: string,
  open: (value: string, params: URLSearchParams) => void | Promise<unknown>,
  ready = true,
  companions: string[] = [],
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(param);
  const openRef = useRef(open);
  openRef.current = open;
  const companionKey = companions.join(',');

  useEffect(() => {
    if (!value || !ready) return;
    void openRef.current(value, new URLSearchParams(searchParams));
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const name of [param, ...(companionKey ? companionKey.split(',') : [])]) next.delete(name);
      return next;
    }, { replace: true });
    // searchParams is read only together with a new value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, value, ready, companionKey, setSearchParams]);
}

/**
 * Scrolls the row of a record opened from a notification into view and outlines it for a moment,
 * as soon as it is rendered (the list may still be filling in). Rows carry data-deep-link="<key>";
 * of a table and its phone cards, the one on screen is taken.
 */
export function revealElement(key: string) {
  let tries = 0;
  const find = () => {
    const el = [...document.querySelectorAll<HTMLElement>(`[data-deep-link="${CSS.escape(key)}"]`)].find((node) => node.getClientRects().length > 0);
    if (!el) {
      if (++tries < 40) setTimeout(find, 100);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('deep-link-flash');
    setTimeout(() => el.classList.remove('deep-link-flash'), 3000);
  };
  find();
}
