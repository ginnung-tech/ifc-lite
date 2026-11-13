/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MAX_SELECTION, type SelectionElement } from './protocol';

/** The slice of the viewer store this module reads (kept structural so it is testable without the store). */
export interface SelectionSource {
  selectedEntity: { modelId: string; expressId: number } | null;
  selectedEntities: ReadonlyArray<{ modelId: string; expressId: number }>;
  models: ReadonlyMap<string, { ifcDataStore?: { entities?: { getGlobalId?: (expressId: number) => string; getName?: (expressId: number) => string; getTypeName?: (expressId: number) => string } | null } | null }>;
  ifcDataStore?: { entities?: { getGlobalId?: (expressId: number) => string; getName?: (expressId: number) => string; getTypeName?: (expressId: number) => string } | null } | null;
}

export interface SelectionIds {
  globalIds: string[];
  /** Names and classes for the ids that have them. */
  elements: SelectionElement[];
  /** True when more than MAX_SELECTION elements are selected and the list was cut. */
  truncated: boolean;
}

/**
 * The selected elements as IFC GlobalIds. An element with no GlobalId (not
 * yet parsed, or a type without one) is skipped, never replaced by a guess.
 */
export function selectedGlobalIds(s: SelectionSource): SelectionIds {
  const refs = s.selectedEntities.length > 0 ? s.selectedEntities : s.selectedEntity ? [s.selectedEntity] : [];
  const out = new Map<string, SelectionElement>();
  for (const ref of refs) {
    const store = s.models.get(ref.modelId)?.ifcDataStore ?? s.ifcDataStore;
    const gid = store?.entities?.getGlobalId?.(ref.expressId);
    if (typeof gid === 'string' && gid.length === 22 && !out.has(gid)) {
      const name = store?.entities?.getName?.(ref.expressId);
      const cls = store?.entities?.getTypeName?.(ref.expressId);
      out.set(gid, {
        global_id: gid,
        ...(name ? { name } : {}),
        ...(cls && /^Ifc[A-Za-z0-9]{1,80}$/.test(cls) ? { ifc_class: cls } : {}),
      });
    }
  }
  const all = [...out.values()];
  const kept = all.slice(0, MAX_SELECTION);
  return { globalIds: kept.map((e) => e.global_id), elements: kept, truncated: all.length > MAX_SELECTION };
}
