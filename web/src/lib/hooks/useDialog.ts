'use client';

import { useEffect, useId, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last. Only the top one reacts to Esc / Tab. */
const stack: symbol[] = [];

/**
 * Minimal accessible-dialog behaviour for Payd's hand-rolled modals:
 * Esc closes, focus moves into the dialog on open, Tab stays inside it,
 * and focus returns to the opener on close.
 *
 * Spread `dialogProps` on the dialog panel and put `id={titleId}` on its heading.
 * Call it before any `if (!isOpen) return null`.
 */
export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const token = Symbol('dialog');
    stack.push(token);
    const opener = document.activeElement as HTMLElement | null;

    const raf = requestAnimationFrame(() => {
      const node = ref.current;
      if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!ref.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return {
    titleId,
    dialogProps: {
      ref,
      role: 'dialog' as const,
      'aria-modal': true as const,
      'aria-labelledby': titleId,
      tabIndex: -1,
    },
  };
}
