/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bcfBaseFrom, docsToLoad, modelForSelection, modelRefOf, newerHeads, type LoadedDoc } from './connection-logic';

const D1 = '4f1d6c52-8a39-4e0b-9d57-3c2a1b7e9f10';
const D2 = '9a8b7c6d-1111-4222-8333-444455556666';
const doc = (documentId: string, modelId: string, versionIndex: number): LoadedDoc => ({ documentId, modelId, name: `${documentId}.ifc`, versionIndex });
const loaded = new Map([[D1, doc(D1, 'm1', 3)], [D2, doc(D2, 'm2', 1)]]);

test('bcfBaseFrom derives the BCF server from the document server, or refuses', () => {
  assert.equal(bcfBaseFrom('https://api.example/cde'), 'https://api.example/bcf');
  assert.equal(bcfBaseFrom('https://api.example/cde/'), 'https://api.example/bcf');
  assert.equal(bcfBaseFrom('https://api.example/prefix/cde?x=1#y'), 'https://api.example/prefix/bcf');
  assert.equal(bcfBaseFrom('https://api.example/documents'), null);
  assert.equal(bcfBaseFrom('not a url'), null);
});

test('a selection belongs to the model of its first element; with none, the first document stands for the project', () => {
  assert.equal(modelForSelection([{ modelId: 'm2' }, { modelId: 'm1' }], loaded)?.documentId, D2);
  assert.equal(modelForSelection([{ modelId: 'unknown' }, { modelId: 'm1' }], loaded)?.documentId, D1);
  assert.equal(modelForSelection([], loaded)?.documentId, D1);
  assert.equal(modelForSelection([{ modelId: 'm1' }], new Map()), undefined);
});

test('modelRefOf is the contract shape', () => {
  assert.deepEqual(modelRefOf(doc(D1, 'm1', 3)), { name: `${D1}.ifc`, document_id: D1, version_index: 3 });
});

test('docsToLoad keeps only what the viewer lacks, in order', () => {
  const rows = [{ document_id: D2 }, { document_id: 'new-1' }, { document_id: D1 }, { document_id: 'new-2' }];
  assert.deepEqual(docsToLoad(rows, loaded).map((r) => r.document_id), ['new-1', 'new-2']);
});

test('newerHeads names the documents whose head is ahead of the viewer, and ignores unknown ones', () => {
  const heads = [
    { document_id: D1, version_index: 4 },
    { document_id: D2, version_index: 1 },
    { document_id: 'not-loaded', version_index: 9 },
  ];
  assert.deepEqual(newerHeads(heads, loaded), [D1]);
});
