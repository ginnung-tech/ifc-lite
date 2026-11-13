/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one way to open Settings (#5857). Every opener (the ribbon header,
 * the mobile menu, the command palette, or a button that deep-links a
 * section such as SpaceMouse) calls `openSettings`, and
 * `SettingsDialogHost` is the one listener. A window event rather than store
 * state keeps it callable from plain modules (palette command builders) and
 * matches the Info dialog's `EVENT_SHOW_SHORTCUTS`.
 */

/** Settings sections, in display order. */
export const SETTINGS_SECTIONS = ['general', 'display', 'performance', 'collaboration', 'privacy'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/**
 * A section outside the registry above: it exists only when the optional
 * Ginnung app is configured, so it is not a palette destination and has no
 * translated label.
 */
export type ExtraSettingsSection = 'ginnung';

export const EVENT_OPEN_SETTINGS = 'ifc-lite:open-settings';

export interface OpenSettingsDetail {
  section?: SettingsSection | ExtraSettingsSection;
}

/** Open Settings, on `section` when given (otherwise the first section). */
export function openSettings(section?: SettingsSection | ExtraSettingsSection): void {
  window.dispatchEvent(new CustomEvent<OpenSettingsDetail>(EVENT_OPEN_SETTINGS, { detail: { section } }));
}
