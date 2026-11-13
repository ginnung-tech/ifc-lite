/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GinnungApi, GinnungApiError } from './api';
import { helloMessage, isFromApp, parseAppMessage, selectionMessage } from './protocol';
import { selectedGlobalIds } from './selection';

const fixture = (rel: string): unknown => JSON.parse(readFileSync(new URL(`./contract/fixtures/${rel}`, import.meta.url), 'utf8'));
const index = (rel: string): Record<string, string> => fixture(rel) as Record<string, string>;
const DOC = '4f1d6c52-8a39-4e0b-9d57-3c2a1b7e9f10';
const G1 = '2O2Fr$t4X7Zf8NOew3FLOH';
const G2 = '0YHx3W5Pn0VPGc2QV$ql8J';

test('viewer-embed contract: app messages parse, viewer messages match the fixtures exactly', () => {
  assert.deepEqual(parseAppMessage(fixture('ready.json')), { ok: true, msg: { type: 'ready', auth: 'signed-in', project: 'P0001' } });
  assert.deepEqual(parseAppMessage(fixture('model-updated.json')), { ok: true, msg: { type: 'model.updated', project: 'P0001', documentId: DOC, versionIndex: 4 } });
  assert.deepEqual(helloMessage({ name: 'carport.ifc', document_id: DOC, version_index: 3 }), fixture('hello.json'));
  assert.deepEqual(selectionMessage([G1, G2], { name: 'carport.ifc', document_id: DOC, version_index: 3 }), fixture('selection.json'));
  assert.deepEqual(selectionMessage([]), fixture('selection-cleared.json'));
  assert.deepEqual(
    selectionMessage([G1], undefined, [{ global_id: G1, name: 'Basic Wall:Partition 100', ifc_class: 'IfcWall' }]),
    fixture('selection-with-elements.json'),
  );
});

test('viewer-embed contract: every invalid fixture is refused by the strict parser', () => {
  for (const file of Object.keys(index('invalid/index.json'))) {
    assert.equal(parseAppMessage(fixture(`invalid/${file}`)).ok, false, file);
  }
  // the viewer-to-app messages are not app messages
  assert.equal(parseAppMessage(fixture('selection.json')).ok, false);
  assert.equal(parseAppMessage({ v: 1, type: 'ready', auth: 'signed-in', token: 'x' }).ok, false);
});

test('selectionMessage refuses what the contract refuses instead of sending it', () => {
  assert.throws(() => selectionMessage(['short']), TypeError);
  assert.throws(() => selectionMessage(Array.from({ length: 513 }, (_, i) => String(i).padStart(22, 'a'))), RangeError);
  assert.deepEqual(selectionMessage([G1, G1]).global_ids as string[], [G1]);
});

test('isFromApp needs the popup window itself and the exact origin', () => {
  const popup = {};
  assert.equal(isFromApp({ source: popup, origin: 'https://app.example' }, popup, 'https://app.example'), true);
  assert.equal(isFromApp({ source: {}, origin: 'https://app.example' }, popup, 'https://app.example'), false);
  assert.equal(isFromApp({ source: popup, origin: 'https://app.example.evil' }, popup, 'https://app.example'), false);
  assert.equal(isFromApp({ source: popup, origin: 'https://app.example' }, null, 'https://app.example'), false);
});

const sel = (ids: Record<number, string>, refs: Array<[string, number]>, single?: [string, number]) => ({
  selectedEntity: single ? { modelId: single[0], expressId: single[1] } : null,
  selectedEntities: refs.map(([modelId, expressId]) => ({ modelId, expressId })),
  models: new Map([['m1', { ifcDataStore: { entities: { getGlobalId: (n: number) => ids[n] ?? '' } } }]]),
});

test('selectedGlobalIds maps the selection to GlobalIds, skips unknown ones and dedupes', () => {
  const r = selectedGlobalIds(sel({ 1: G1, 2: G2 }, [['m1', 1], ['m1', 2], ['m1', 1], ['m1', 99]]));
  assert.deepEqual(r, { globalIds: [G1, G2], elements: [{ global_id: G1 }, { global_id: G2 }], truncated: false });
  assert.deepEqual(selectedGlobalIds(sel({ 5: G1 }, [], ['m1', 5])).globalIds, [G1]);
  assert.deepEqual(selectedGlobalIds(sel({}, [])).globalIds, []);
  // a value that is not a 22-character GlobalId is never sent
  assert.deepEqual(selectedGlobalIds(sel({ 1: 'abc' }, [['m1', 1]])).globalIds, []);
});

test('selectedGlobalIds carries the name and class of each element, and drops a class that is not an IFC class', () => {
  const src = {
    selectedEntity: null,
    selectedEntities: [{ modelId: 'm1', expressId: 1 }, { modelId: 'm1', expressId: 2 }],
    models: new Map([['m1', { ifcDataStore: { entities: {
      getGlobalId: (n: number) => ({ 1: G1, 2: G2 } as Record<number, string>)[n] ?? '',
      getName: (n: number) => (n === 1 ? 'Wall 1' : ''),
      getTypeName: (n: number) => (n === 1 ? 'IfcWall' : 'wall'),
    } } }]]),
  };
  const r = selectedGlobalIds(src);
  assert.deepEqual(r.globalIds, [G1, G2]);
  assert.deepEqual(r.elements, [{ global_id: G1, name: 'Wall 1', ifc_class: 'IfcWall' }, { global_id: G2 }]);
  // an element nobody can name is not sent as an element
  assert.deepEqual(selectionMessage(r.globalIds, undefined, r.elements).elements, [{ global_id: G1, name: 'Wall 1', ifc_class: 'IfcWall' }]);
});

test('selectedGlobalIds cuts at 512 and says so', () => {
  const ids: Record<number, string> = {};
  const refs: Array<[string, number]> = [];
  for (let i = 1; i <= 600; i++) { ids[i] = String(i).padStart(22, 'b'); refs.push(['m1', i]); }
  const r = selectedGlobalIds(sel(ids, refs));
  assert.equal(r.globalIds.length, 512);
  assert.equal(r.truncated, true);
});

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init?: RequestInit) => { calls.push({ url, init: init ?? {} }); return handler(url, init ?? {}); };
  return { f, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const version = { document_id: DOC, version_index: 4, title: 'carport.ifc', links: { document_version_download: { url: 'https://api.example/cde/documents/1.0/documents/x/versions/4/download' } } };

test('GinnungApi sends the bearer, lists projects and documents, and reads the download link', async () => {
  const { f, calls } = fakeFetch((url) => (url.endsWith('/projects')
    ? json({ projects: [{ project_id: 'P0001', name: 'Home' }] })
    : json({ project_id: 'P0001', documents: [{ document_id: DOC, title: 'carport.ifc', head_index: 4, head: version }] })));
  const api = new GinnungApi('https://api.example/cde/', 'tok', f);
  assert.deepEqual(await api.listProjects(), [{ project_id: 'P0001', name: 'Home' }]);
  const docs = await api.listDocuments('P0001');
  assert.equal(docs[0]!.head.download, version.links.document_version_download.url);
  assert.equal(calls[0]!.url, 'https://api.example/cde/ginnung/1.0/projects');
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, 'Bearer tok');
});

test('GinnungApi.heads: 304 is null, a new etag returns the versions, the etag is sent back', async () => {
  const { f, calls } = fakeFetch((_u, init) => ((init.headers as Record<string, string>)['If-None-Match'] === '"a"'
    ? new Response(null, { status: 304 })
    : json({ versions: [version] }, 200, { ETag: '"b"' })));
  const api = new GinnungApi('https://api.example/cde', 'tok', f);
  assert.equal(await api.heads([DOC], '"a"'), null);
  const res = await api.heads([DOC]);
  assert.equal(res?.etag, '"b"');
  assert.equal(res?.versions[0]?.version_index, 4);
  assert.equal(calls[0]!.init.method, 'POST');
});

test('GinnungApi fails loudly: a refusal carries the server message, a wrong shape throws', async () => {
  const refuse = new GinnungApi('https://api.example/cde', 'tok', fakeFetch(() => json({ message: 'token revoked' }, 401)).f);
  await assert.rejects(() => refuse.listProjects(), (e: unknown) => e instanceof GinnungApiError && e.status === 401 && e.message === 'token revoked');
  const odd = new GinnungApi('https://api.example/cde', 'tok', fakeFetch(() => json({ nope: 1 })).f);
  await assert.rejects(() => odd.listProjects(), GinnungApiError);
  await assert.rejects(() => odd.listDocuments('P0001'), GinnungApiError);
});
