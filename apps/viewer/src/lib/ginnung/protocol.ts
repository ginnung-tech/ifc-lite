/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewer side of Ginnung's `viewer-embed` contract: the Ginnung app opens
 * in a popup and the two exchange `postMessage`.
 *
 *   app → viewer: `ready {auth, project?}`, `model.updated {project, document_id, version_index}`
 *   viewer → app: `hello {model?}`, `selection {global_ids ≤ 512, model?}`
 *
 * Rules (both ends): accept a message only from the other window object AND
 * the exact expected origin; parse strictly (exact keys, `v: 1`); post only to
 * one explicit origin, never "*". No credentials ever travel in a message.
 *
 * Pure module: no store, no DOM, so it is unit-tested on its own against the
 * vendored contract fixtures (`./contract/`).
 */

export const EMBED_VERSION = 1;
export const MAX_SELECTION = 512;

const GLOBAL_ID = /^[0-9A-Za-z_$]{22}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT = /^P[0-9]{4,6}$/;

export interface ModelRef {
  name: string;
  document_id?: string;
  version_index?: number;
}

/** What the viewer knows about one selected element. */
export interface SelectionElement {
  global_id: string;
  name?: string;
  ifc_class?: string;
}

export type AppMessage =
  | { type: 'ready'; auth: 'signed-in' | 'signed-out'; project?: string }
  | { type: 'model.updated'; project: string; documentId: string; versionIndex: number };

export function helloMessage(model?: ModelRef): Record<string, unknown> {
  return model ? { v: EMBED_VERSION, type: 'hello', model } : { v: EMBED_VERSION, type: 'hello' };
}

/**
 * Selection message. Throws on a malformed id or too many: the caller sends at
 * most MAX_SELECTION. `elements` (names and IFC classes) are optional and only
 * sent for ids that are in the selection.
 */
export function selectionMessage(globalIds: readonly string[], model?: ModelRef, elements: readonly SelectionElement[] = []): Record<string, unknown> {
  if (globalIds.length > MAX_SELECTION) throw new RangeError(`selection has ${globalIds.length} ids, the contract allows ${MAX_SELECTION}`);
  for (const g of globalIds) if (!GLOBAL_ID.test(g)) throw new TypeError('selection holds a value that is not an IFC GlobalId');
  const ids = [...new Set(globalIds)];
  const msg: Record<string, unknown> = { v: EMBED_VERSION, type: 'selection', global_ids: ids };
  const named = elements.filter((e) => ids.includes(e.global_id) && (e.name || e.ifc_class));
  if (named.length > 0) {
    msg.elements = named.map((e) => ({
      global_id: e.global_id,
      ...(e.name ? { name: e.name.slice(0, 200) } : {}),
      ...(e.ifc_class && /^Ifc[A-Za-z0-9]{1,80}$/.test(e.ifc_class) ? { ifc_class: e.ifc_class } : {}),
    }));
  }
  if (model) msg.model = model;
  return msg;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

/** Strict parse of an app → viewer message. `reason` names why it was refused, never the payload. */
export function parseAppMessage(raw: unknown): { ok: true; msg: AppMessage } | { ok: false; reason: string } {
  if (!isObj(raw)) return { ok: false, reason: 'not an object' };
  if (raw.v !== EMBED_VERSION) return { ok: false, reason: 'unsupported version' };
  if (raw.type === 'ready') {
    if (!onlyKeys(raw, ['v', 'type', 'auth', 'project'])) return { ok: false, reason: 'unexpected field' };
    if (raw.auth !== 'signed-in' && raw.auth !== 'signed-out') return { ok: false, reason: 'bad auth' };
    if (raw.project !== undefined && (typeof raw.project !== 'string' || !PROJECT.test(raw.project))) return { ok: false, reason: 'bad project' };
    const msg: AppMessage = { type: 'ready', auth: raw.auth };
    if (typeof raw.project === 'string') msg.project = raw.project;
    return { ok: true, msg };
  }
  if (raw.type === 'model.updated') {
    if (!onlyKeys(raw, ['v', 'type', 'project', 'document_id', 'version_index'])) return { ok: false, reason: 'unexpected field' };
    const { project, document_id, version_index } = raw;
    if (typeof project !== 'string' || !PROJECT.test(project)) return { ok: false, reason: 'bad project' };
    if (typeof document_id !== 'string' || !UUID.test(document_id)) return { ok: false, reason: 'bad document_id' };
    if (typeof version_index !== 'number' || !Number.isInteger(version_index) || version_index < 1) return { ok: false, reason: 'bad version_index' };
    return { ok: true, msg: { type: 'model.updated', project, documentId: document_id, versionIndex: version_index } };
  }
  return { ok: false, reason: 'unknown type' };
}

/** True only for a message that came from `popup` itself AND from exactly `appOrigin`. */
export function isFromApp(ev: { source: unknown; origin: string }, popup: unknown, appOrigin: string): boolean {
  return popup !== null && popup !== undefined && ev.source === popup && ev.origin === appOrigin;
}
