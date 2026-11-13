/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appAddress, getFramePeer, setFramePeer, subscribeFramePeer } from './peer';

test('appAddress keeps the address as given, normalised', () => {
  assert.equal(appAddress('https://app.example/ginnung/'), 'https://app.example/ginnung/');
  assert.equal(appAddress('https://app.example/ginnung/?lod=350'), 'https://app.example/ginnung/?lod=350');
});

test('appAddress refuses something that is not an address instead of framing it', () => {
  assert.equal(appAddress('not a url'), null);
  assert.equal(appAddress(''), null);
});

test('the frame peer is held, announced to subscribers on change only, and cleared', () => {
  const calls: number[] = [];
  const off = subscribeFramePeer(() => calls.push(1));
  const win = {} as Window;
  setFramePeer(win);
  setFramePeer(win); // unchanged: no second announcement
  assert.equal(getFramePeer(), win);
  setFramePeer(null);
  assert.equal(getFramePeer(), null);
  assert.equal(calls.length, 2);
  off();
  setFramePeer(win);
  assert.equal(calls.length, 2);
  setFramePeer(null);
});
