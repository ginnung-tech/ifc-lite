/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { appAddress, setFramePeer } from '@/lib/ginnung/peer';
import { ginnungStrings as S } from '@/lib/ginnung/strings';
import { getPaneActions, getPaneState, subscribePane, type PaneState } from '@/lib/ginnung/ui-store';

const APP = import.meta.env.VITE_GINNUNG_APP_URL as string | undefined;

function useStatus(): PaneState {
  return useSyncExternalStore(subscribePane, getPaneState, getPaneState);
}

/**
 * The assistant pane while the Ginnung app is configured. Before a connection
 * it is the connection form; once connected it shows what is connected (the
 * document server and the BCF server, each on its own line) above the Ginnung
 * app itself in a frame. The frame reaches the app's session cookie only when
 * this viewer is hosted on the same site as the app; "Open in a window" is the
 * way around that, for example from a local dev server.
 */
export function GinnungPane() {
  const st = useStatus();
  return st.phase === 'connected' ? <Connected st={st} /> : <ConnectForm st={st} />;
}

function ConnectForm({ st }: { st: PaneState }) {
  const [token, setToken] = useState('');
  const busy = st.phase === 'connecting';
  return (
    <form
      className="flex h-full flex-col gap-3 p-4 text-sm"
      onSubmit={(e) => { e.preventDefault(); void getPaneActions()?.connect(token); }}
    >
      <strong>{S.title}</strong>
      <p className="text-muted-foreground">{S.intro}</p>
      <label className="text-xs text-muted-foreground" htmlFor="ginnung-token">{S.token}</label>
      <Input id="ginnung-token" type="password" autoComplete="off" value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} />
      <p className="text-xs text-muted-foreground">{S.tokenHint}</p>
      <Button type="submit" disabled={busy || !token.trim()}>{busy ? S.connecting : S.connect}</Button>
      {st.error && <p role="alert" className="text-xs text-destructive">{st.error}</p>}
    </form>
  );
}

function Connected({ st }: { st: PaneState }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const src = APP ? appAddress(APP) : null;
  useEffect(() => () => setFramePeer(null), []);
  const actions = getPaneActions();
  const bcfText =
    st.bcf.state === 'connected' ? `${S.bcfConnected} · ${st.bcf.topics} ${S.bcfTopics}`
    : st.bcf.state === 'failed' ? `${S.bcfFailed}: ${st.bcf.message}`
    : S.bcfConnecting;
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1 border-b p-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          {st.projects.length > 1 ? (
            <select
              aria-label={S.project}
              className="min-w-0 flex-1 rounded border bg-background p-1"
              value={st.projectId}
              onChange={(e) => void actions?.selectProject(e.target.value)}
            >
              {st.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <span className="truncate font-medium">{st.projects.find((p) => p.id === st.projectId)?.name ?? S.title}</span>
          )}
          <span className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => actions?.openWindow()}>{S.openWindow}</Button>
            <Button size="sm" variant="ghost" onClick={() => actions?.disconnect()}>{S.disconnect}</Button>
          </span>
        </div>
        <div className="text-muted-foreground">
          {S.documentsServer}: {st.models.length === 0 ? S.noModels : st.models.map((m) => `${m.name} · ${S.version} ${m.versionIndex}`).join(', ')}
        </div>
        <div className={st.bcf.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{S.bcfServer}: {bcfText}</div>
        {st.error && <div role="alert" className="text-destructive">{st.error}</div>}
      </div>
      {src && (
        <iframe
          ref={ref}
          title={S.title}
          src={src}
          className="min-h-0 w-full flex-1 border-0"
          allow="clipboard-write"
          onLoad={() => setFramePeer(ref.current?.contentWindow ?? null)}
        />
      )}
    </div>
  );
}
