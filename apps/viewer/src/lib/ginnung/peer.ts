/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The window of the framed app, when the app is shown in a frame (the
 * assistant pane) instead of a popup. One module-level slot: the frame
 * component writes it, the message handling in `GinnungTool` reads it.
 */

let peer: Window | null = null;
const listeners = new Set<() => void>();

export function setFramePeer(next: Window | null): void {
  if (peer === next) return;
  peer = next;
  for (const l of [...listeners]) l();
}

export function getFramePeer(): Window | null {
  return peer;
}

export function subscribeFramePeer(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** The framed app's address with the embed flag, or null when it is not a valid address. */
export function frameAddress(app: string): string | null {
  try {
    const url = new URL(app);
    url.searchParams.set('embedded', 'true');
    return url.toString();
  } catch {
    return null;
  }
}
