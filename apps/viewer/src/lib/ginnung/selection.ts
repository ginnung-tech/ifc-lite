/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MAX_SELECTION } from './protocol';

/** The slice of the viewer store this module reads (kept structural so it is testable without the store). */
export interface SelectionSource {
  selectedEntity: { modelId: string; expressId: number } | null;
  selectedEntities: ReadonlyArray<{ modelId: string; expressId: number }>;
  models: ReadonlyMap<string, { ifcDataStore?: { entities?: { getGlobalId?: (expressId: number) => string } | null } | null }>;
  ifcDataStore?: { entities?: { getGlobalId?: (expressId: number) => string } | null } | null;
}

export interface SelectionIds {
  globalIds: string[];
  /** True when more than MAX_SELECTION elements are selected and the list was cut. */
  truncated: boolean;
}

/**
 * The selected elements as IFC GlobalIds. An element with no GlobalId (not
 * yet parsed, or a type without one) is skipped, never replaced by a guess.
 */
export function selectedGlobalIds(s: SelectionSource): SelectionIds {
  const refs = s.selectedEntities.length > 0 ? s.selectedEntities : s.selectedEntity ? [s.selectedEntity] : [];
  const out = new Set<string>();
  for (const ref of refs) {
    const store = s.models.get(ref.modelId)?.ifcDataStore ?? s.ifcDataStore;
    const gid = store?.entities?.getGlobalId?.(ref.expressId);
    if (typeof gid === 'string' && gid.length === 22) out.add(gid);
  }
  const all = [...out];
  return { globalIds: all.slice(0, MAX_SELECTION), truncated: all.length > MAX_SELECTION };
}
