/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ginnungStrings as S } from '@/lib/ginnung/strings';
import { getPaneActions, getPaneState, subscribePane, type PaneState } from '@/lib/ginnung/ui-store';

function useStatus(): PaneState {
  return useSyncExternalStore(subscribePane, getPaneState, getPaneState);
}

/**
 * The Ginnung connection, as a section of Settings (shown only when the app is
 * configured). Before a connection: the token form. Once connected: the project,
 * what the document server and the BCF server each hold, and Disconnect. The
 * assistant pane only shows the app itself.
 */
export function GinnungSettings() {
  const st = useStatus();
  return st.phase === 'connected' ? <Connected st={st} /> : <ConnectForm st={st} />;
}

function ConnectForm({ st }: { st: PaneState }) {
  const [token, setToken] = useState('');
  const busy = st.phase === 'connecting';
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={(e) => { e.preventDefault(); void getPaneActions()?.connect(token); }}
    >
      <p className="text-muted-foreground">{S.intro}</p>
      <label className="text-xs text-muted-foreground" htmlFor="ginnung-token">{S.token}</label>
      <Input id="ginnung-token" type="password" autoComplete="off" value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} />
      <p className="text-xs text-muted-foreground">{S.tokenHint}</p>
      <div>
        <Button type="submit" disabled={busy || !token.trim()}>{busy ? S.connecting : S.connect}</Button>
      </div>
      {st.error && <p role="alert" className="text-xs text-destructive">{st.error}</p>}
    </form>
  );
}

function Row({ label, children, bad }: { label: string; children: React.ReactNode; bad?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 text-right ${bad ? 'text-destructive' : ''}`}>{children}</span>
    </div>
  );
}

function Connected({ st }: { st: PaneState }) {
  const actions = getPaneActions();
  const bcfText =
    st.bcf.state === 'connected' ? `${S.bcfConnected} · ${st.bcf.topics} ${S.bcfTopics}`
    : st.bcf.state === 'failed' ? `${S.bcfFailed}: ${st.bcf.message}`
    : S.bcfConnecting;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="divide-y rounded-md border px-3">
        <Row label={S.project}>
          {st.projects.length > 1 ? (
            <select
              aria-label={S.project}
              className="rounded border bg-background p-1"
              value={st.projectId}
              onChange={(e) => void actions?.selectProject(e.target.value)}
            >
              {st.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (st.projects.find((p) => p.id === st.projectId)?.name ?? '')}
        </Row>
        <Row label={S.documentsServer}>
          {st.models.length === 0
            ? S.noModels
            : st.models.map((m) => <div key={m.name}>{m.name} · {S.version} {m.versionIndex}</div>)}
        </Row>
        <Row label={S.bcfServer} bad={st.bcf.state === 'failed'}>{bcfText}</Row>
      </div>
      {st.error && <p role="alert" className="text-xs text-destructive">{st.error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => actions?.openWindow()}>{S.openWindow}</Button>
        <Button variant="outline" onClick={() => actions?.disconnect()}>{S.disconnect}</Button>
      </div>
    </div>
  );
}
