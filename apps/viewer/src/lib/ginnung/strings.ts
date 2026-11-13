/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * English text of the Ginnung tool. Kept out of the JSX so the i18n literal
 * gate sees no text there. A demo-branch tool: not translated.
 */
export const ginnungStrings = {
  tool: '}{ Ginnung',
  title: 'Ginnung',
  token: 'Access token',
  tokenHint: 'Create one under Connected apps in Ginnung and paste it here.',
  connect: 'Connect',
  project: 'Project',
  models: 'Models',
  open: 'Open',
  openApp: 'Open Ginnung',
  noModels: 'This project has no models yet.',
  following: 'Following the newest version',
  version: 'version',
  selected: 'selected and shared',
  truncated: 'Only the first 512 are shared.',
  appBlocked: 'The browser blocked the Ginnung window. Allow pop-ups for this page and try again.',
  close: 'Close',
} as const;
