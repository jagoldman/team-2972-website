// Types for notice-menu.js (2972 shell kit 0.5.0). Source of truth: infra/shell/notice-menu.d.ts.

/** The selector of a notice row: `.shbar-notice-link[data-id]` with `data-read="true|false"`. */
export const NOTICE_ROW: string;
/** "Mark as unread" for a read notice, "Mark as read" for an unread one. */
export function noticeMenuWords(read: boolean): string;
/** What the item says when the server did not take it. */
export function noticeMenuFailed(read: boolean): string;
/**
 * Installs the bell's row menu on the notices panel. `flip(id, read)` posts `{ ids: [id], read }` and resolves true
 * only on a 204.
 */
export function installNoticeMenu(
  panel: HTMLElement,
  opts: { flip(id: string, read: boolean): Promise<boolean>; onFailed?(text: string): void },
): { close(refocus: boolean): void; readonly open: boolean; destroy(): void };
