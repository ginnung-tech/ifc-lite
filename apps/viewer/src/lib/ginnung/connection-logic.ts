/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The decisions of the Ginnung connection, without the viewer in them so they
 * can be tested on their own.
 */

import type { ModelRef } from './protocol';

/** What the controller keeps for each document it has loaded. */
export interface LoadedDoc {
  documentId: string;
  modelId: string;
  name: string;
  versionIndex: number;
}

/**
 * The BCF server's address, from the document server's (same host, same token):
 * `https://api.example/cde` becomes `https://api.example/bcf`. Null for an
 * address that is not a `/cde` one, so a wrong configuration fails instead of
 * the token going to a guessed address.
 */
export function bcfBaseFrom(cdeUrl: string): string | null {
  try {
    const url = new URL(cdeUrl);
    const path = url.pathname.replace(/\/+$/, '');
    if (!path.endsWith('/cde')) return null;
    url.pathname = `${path.slice(0, -'/cde'.length)}/bcf`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

/** The contract's model reference for a loaded document. */
export function modelRefOf(d: LoadedDoc): ModelRef {
  return { name: d.name, document_id: d.documentId, version_index: d.versionIndex };
}

/**
 * Which model a selection belongs to: the one the first selected element is in.
 * With nothing selected, the first loaded document stands for the project.
 */
export function modelForSelection(
  selected: ReadonlyArray<{ modelId: string }>,
  loaded: ReadonlyMap<string, LoadedDoc>,
): LoadedDoc | undefined {
  const byModel = new Map([...loaded.values()].map((d) => [d.modelId, d]));
  for (const s of selected) {
    const d = byModel.get(s.modelId);
    if (d) return d;
  }
  return loaded.values().next().value;
}

/** Documents of the project that are not in the viewer yet, in the project order. */
export function docsToLoad<T extends { document_id: string }>(
  rows: readonly T[],
  loaded: ReadonlyMap<string, LoadedDoc>,
): T[] {
  return rows.filter((r) => !loaded.has(r.document_id));
}

/** The ids of the documents whose head is newer than what the viewer shows. */
export function newerHeads(
  heads: ReadonlyArray<{ document_id: string; version_index: number }>,
  loaded: ReadonlyMap<string, LoadedDoc>,
): string[] {
  return heads
    .filter((h) => {
      const l = loaded.get(h.document_id);
      return !!l && h.version_index > l.versionIndex;
    })
    .map((h) => h.document_id);
}
