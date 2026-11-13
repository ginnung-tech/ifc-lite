/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Ginnung pane shows, and what it can ask for. One module-level slot,
 * like `peer.ts`: the controller (`GinnungTool`, which owns the loaders and the
 * viewer store) writes the state and registers the actions; the pane
 * (`GinnungPane`) only renders and calls them.
 */

export type Phase = 'disconnected' | 'connecting' | 'connected';

export interface PaneModel {
  name: string;
  versionIndex: number;
}

export interface PaneState {
  phase: Phase;
  /** Why the last connect or load failed, in words. Empty when fine. */
  error: string;
  projects: { id: string; name: string }[];
  projectId: string;
  models: PaneModel[];
  /** The BCF server leg of the connection, reported on its own. */
  bcf: { state: 'off' | 'connecting' | 'connected' | 'failed'; message: string; topics: number };
}

export interface PaneActions {
  connect(token: string): Promise<void>;
  disconnect(): void;
  selectProject(id: string): Promise<void>;
  /** Open the app in its own window (when the viewer is not on the app's site). */
  openWindow(): void;
}

const initial = (): PaneState => ({
  phase: 'disconnected', error: '', projects: [], projectId: '', models: [],
  bcf: { state: 'off', message: '', topics: 0 },
});

let state: PaneState = initial();
let actions: PaneActions | null = null;
const listeners = new Set<() => void>();

export function getPaneState(): PaneState {
  return state;
}

export function setPaneState(patch: Partial<PaneState>): void {
  state = { ...state, ...patch };
  for (const l of [...listeners]) l();
}

export function resetPaneState(): void {
  state = initial();
  for (const l of [...listeners]) l();
}

export function subscribePane(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function registerPaneActions(next: PaneActions | null): void {
  actions = next;
}

export function getPaneActions(): PaneActions | null {
  return actions;
}
