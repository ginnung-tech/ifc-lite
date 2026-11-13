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

/** The app's address as a clean absolute URL, or null when it is not one (so nothing invalid is framed). */
export function appAddress(app: string): string | null {
  try {
    return new URL(app).toString();
  } catch {
    return null;
  }
}
