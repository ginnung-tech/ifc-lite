/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { openSettings } from '@/lib/settings/open-settings';
import { appAddress, setFramePeer } from '@/lib/ginnung/peer';
import { ginnungStrings as S } from '@/lib/ginnung/strings';
import { getPaneState, subscribePane, type PaneState } from '@/lib/ginnung/ui-store';

const APP = import.meta.env.VITE_GINNUNG_APP_URL as string | undefined;

function useStatus(): PaneState {
  return useSyncExternalStore(subscribePane, getPaneState, getPaneState);
}

/**
 * The assistant pane while the Ginnung app is configured: the app itself, in a
 * frame, once connected. The connection lives in Settings (section Ginnung);
 * until then the pane says so and opens it. The frame reaches the app's session
 * cookie only when this viewer is hosted on the same site as the app.
 */
export function GinnungPane() {
  const st = useStatus();
  return st.phase === 'connected' ? <Frame /> : <NotConnected st={st} />;
}

function NotConnected({ st }: { st: PaneState }) {
  const busy = st.phase === 'connecting';
  return (
    <div className="flex h-full flex-col items-start gap-3 p-4 text-sm">
      <strong>{S.title}</strong>
      <p className="text-muted-foreground">{busy ? S.connecting : S.paneNotConnected}</p>
      {st.error && <p role="alert" className="text-xs text-destructive">{st.error}</p>}
      {!busy && <Button onClick={() => openSettings('ginnung')}>{S.openSettings}</Button>}
    </div>
  );
}

function Frame() {
  const ref = useRef<HTMLIFrameElement>(null);
  const src = APP ? appAddress(APP) : null;
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
