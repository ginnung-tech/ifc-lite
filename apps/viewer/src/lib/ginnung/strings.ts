/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * English text of the Ginnung pane. Kept out of the JSX so the i18n literal
 * gate sees no text there. A demo-branch tool: not translated.
 */
export const ginnungStrings = {
  title: 'Ginnung',
  intro: 'Connect to Ginnung to bring the models of a project into the viewer, read its issues, and ask Gróa for changes.',
  token: 'Access token',
  tokenHint: 'Create one under Connected apps in Ginnung and paste it here.',
  connect: 'Connect',
  connecting: 'Connecting…',
  disconnect: 'Disconnect',
  project: 'Project',
  noProjects: 'This account has no Ginnung projects.',
  models: 'Models',
  noModels: 'No models in this project yet.',
  version: 'version',
  documentsServer: 'Document server',
  bcfServer: 'BCF server',
  bcfConnecting: 'connecting…',
  bcfConnected: 'connected',
  bcfTopics: 'topics',
  bcfFailed: 'not connected',
  bcfBadAddress: 'The BCF address could not be derived from the document server address.',
  openWindow: 'Open in a window',
  appBlocked: 'The browser blocked the Ginnung window. Allow pop-ups for this page and try again.',
} as const;
