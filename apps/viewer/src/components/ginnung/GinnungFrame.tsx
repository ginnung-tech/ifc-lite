/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useRef } from 'react';
import { frameAddress, setFramePeer } from '@/lib/ginnung/peer';
import { ginnungStrings as S } from '@/lib/ginnung/strings';

const APP = import.meta.env.VITE_GINNUNG_APP_URL as string | undefined;

/** True when the assistant pane should show the Ginnung app. */
export function ginnungFrameConfigured(): boolean {
  return !!APP && frameAddress(APP) !== null;
}

/**
 * The Ginnung app, in a frame, as the body of the assistant pane. It reaches
 * the app's session cookie only when this viewer is hosted on the same site as
 * the app (a sibling subdomain); the messages it exchanges with the viewer are
 * the ones in contract `viewer-embed`, handled in `GinnungTool`.
 */
export function GinnungFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  const src = APP ? frameAddress(APP) : null;

  useEffect(() => () => setFramePeer(null), []);
  if (!src) return null;

  return (
    <iframe
      ref={ref}
      title={S.title}
      src={src}
      className="h-full w-full border-0"
      allow="clipboard-write"
      onLoad={() => setFramePeer(ref.current?.contentWindow ?? null)}
    />
  );
}
