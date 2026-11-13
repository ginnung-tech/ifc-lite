/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useViewerStore } from '@/store';
import { useIfcLoader } from '@/hooks/useIfcLoader';
import { GinnungApi, GinnungApiError, type DocumentRow, type ProjectRow, type VersionRow } from '@/lib/ginnung/api';
import { helloMessage, isFromApp, parseAppMessage, selectionMessage, type ModelRef } from '@/lib/ginnung/protocol';
import { getFramePeer, subscribeFramePeer } from '@/lib/ginnung/peer';
import { selectedGlobalIds } from '@/lib/ginnung/selection';
import { ginnungStrings as S } from '@/lib/ginnung/strings';

const CDE = import.meta.env.VITE_GINNUNG_CDE_URL as string | undefined;
const APP = import.meta.env.VITE_GINNUNG_APP_URL as string | undefined;
const TOKEN_KEY = 'ginnung-demo.token';
const FOLLOW_MS = 4000;

interface Current { project: string; documentId: string; versionIndex: number; name: string; modelId: string; etag?: string }

function readToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}
function writeToken(v: string): void {
  try { localStorage.setItem(TOKEN_KEY, v); } catch { /* private window: the token stays in memory only */ }
}
const say = (e: unknown): string => (e instanceof GinnungApiError ? e.message : e instanceof Error ? e.message : String(e));

/**
 * Opens a Ginnung model in the viewer, follows its newest version, and opens
 * the Ginnung app in a popup that receives the viewer's selection and tells
 * the viewer when a task committed a new version (contract `viewer-embed`).
 * Rendered only when `VITE_GINNUNG_APP_URL` and `VITE_GINNUNG_CDE_URL` are set.
 */
export function GinnungTool() {
  if (!CDE || !APP) return null;
  return <Tool cde={CDE} app={APP} />;
}

function Tool({ cde, app }: { cde: string; app: string }) {
  const { loadFile } = useIfcLoader();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(readToken);
  const [api, setApi] = useState<GinnungApi | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [project, setProject] = useState('');
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [error, setError] = useState('');
  const [selCount, setSelCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const popup = useRef<Window | null>(null);
  const appReady = useRef(false);
  const currentRef = useRef<Current | null>(null);
  currentRef.current = current;
  const appOrigin = new URL(app).origin;

  const modelRef = useCallback((): ModelRef | undefined => {
    const c = currentRef.current;
    return c ? { name: c.name, document_id: c.documentId, version_index: c.versionIndex } : undefined;
  }, []);

  /** The app's window: the popup while it is open, else the frame in the assistant pane. */
  const peerWindow = useCallback((): Window | null => {
    const w = popup.current;
    if (w && !w.closed) return w;
    return getFramePeer();
  }, []);

  const post = useCallback((msg: Record<string, unknown>) => {
    peerWindow()?.postMessage(msg, appOrigin);
  }, [appOrigin, peerWindow]);

  const sendSelection = useCallback(() => {
    const ids = selectedGlobalIds(useViewerStore.getState() as never);
    setSelCount(ids.globalIds.length);
    setTruncated(ids.truncated);
    if (appReady.current) post(selectionMessage(ids.globalIds, modelRef(), ids.elements));
  }, [post, modelRef]);

  /** Download a version and make it the open model, replacing the previous Ginnung model. */
  const loadVersion = useCallback(async (a: GinnungApi, v: VersionRow, projectId: string, etag?: string) => {
    const bytes = await a.download(v.download);
    const prev = currentRef.current;
    if (prev) useViewerStore.getState().removeModel(prev.modelId);
    const modelId = crypto.randomUUID();
    const name = `${v.title || 'model'}`.replace(/\.ifc$/i, '') + '.ifc';
    await loadFile(new File([bytes], name, { type: 'application/x-step' }), { kind: 'primary', modelId });
    const next: Current = { project: projectId, documentId: v.document_id, versionIndex: v.version_index, name, modelId, etag };
    currentRef.current = next;
    setCurrent(next);
    if (appReady.current) post(helloMessage({ name, document_id: v.document_id, version_index: v.version_index }));
  }, [loadFile, post]);

  const connect = useCallback(async () => {
    setError('');
    try {
      const a = new GinnungApi(cde, token.trim());
      const rows = await a.listProjects();
      writeToken(token.trim());
      setApi(a);
      setProjects(rows);
      setProject(rows[0]?.project_id ?? '');
    } catch (e) { setError(say(e)); }
  }, [cde, token]);

  useEffect(() => {
    if (!api || !project) { setDocs([]); return; }
    let live = true;
    api.listDocuments(project).then((d) => { if (live) setDocs(d); }).catch((e) => { if (live) setError(say(e)); });
    return () => { live = false; };
  }, [api, project]);

  // Follow the newest version of the open model: one cheap conditional request every few seconds.
  useEffect(() => {
    if (!api || !current) return;
    let busy = false;
    const id = setInterval(async () => {
      const c = currentRef.current;
      if (busy || !c) return;
      busy = true;
      try {
        const res = await api.heads([c.documentId], c.etag);
        const head = res?.versions.find((v) => v.document_id === c.documentId);
        if (res && head && head.version_index > c.versionIndex) await loadVersion(api, head, c.project, res.etag);
        else if (res && currentRef.current === c) setCurrent({ ...c, etag: res.etag });
      } catch (e) { setError(say(e)); } finally { busy = false; }
    }, FOLLOW_MS);
    return () => clearInterval(id);
  }, [api, current?.documentId, loadVersion]);

  // Messages from the popup: only from that window and exactly its origin.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (!isFromApp(ev, popup.current, appOrigin) && !isFromApp(ev, getFramePeer(), appOrigin)) return;
      const parsed = parseAppMessage(ev.data);
      if (!parsed.ok) { console.warn(`[ginnung] dropped a message from the app: ${parsed.reason}`); return; }
      const msg = parsed.msg;
      if (msg.type === 'ready') {
        appReady.current = true;
        post(helloMessage(modelRef()));
        sendSelection();
      } else if (api && currentRef.current?.documentId === msg.documentId && msg.versionIndex > currentRef.current.versionIndex) {
        const c = currentRef.current;
        api.heads([c.documentId]).then((res) => {
          const head = res?.versions.find((v) => v.document_id === c.documentId);
          if (res && head && head.version_index >= msg.versionIndex) return loadVersion(api, head, c.project, res.etag);
        }).catch((e) => setError(say(e)));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [api, appOrigin, loadVersion, modelRef, post, sendSelection]);

  useEffect(() => useViewerStore.subscribe(sendSelection), [sendSelection]);

  // A frame that (re)loads is a new app instance: it announces itself again.
  useEffect(() => subscribeFramePeer(() => { appReady.current = false; }), []);

  const openApp = useCallback(() => {
    setError('');
    const width = 420;
    const left = Math.max(0, window.screenX + window.outerWidth - width);
    const w = window.open(app, 'ginnung-app', `popup=yes,width=${width},height=${window.outerHeight},left=${left},top=${window.screenY}`);
    if (!w) { setError(S.appBlocked); return; }
    popup.current = w;
    appReady.current = false;
  }, [app]);

  useEffect(() => () => { popup.current?.close(); }, []);

  if (!open) {
    return (
      <div className="fixed bottom-4 left-4 z-50">
        <Button size="sm" onClick={() => setOpen(true)}>{S.tool}</Button>
      </div>
    );
  }

  return (
    <section aria-label={S.title} className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-md border bg-background p-3 text-sm shadow-lg">
      <div className="flex items-center justify-between">
        <strong>{S.title}</strong>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{S.close}</Button>
      </div>
      {!api ? (
        <>
          <label className="block text-xs text-muted-foreground" htmlFor="ginnung-token">{S.token}</label>
          <Input id="ginnung-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          <p className="text-xs text-muted-foreground">{S.tokenHint}</p>
          <Button size="sm" disabled={!token.trim()} onClick={() => void connect()}>{S.connect}</Button>
        </>
      ) : (
        <>
          <label className="block text-xs text-muted-foreground" htmlFor="ginnung-project">{S.project}</label>
          <select id="ginnung-project" className="w-full rounded border bg-background p-1" value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
          </select>
          <div className="text-xs text-muted-foreground">{S.models}</div>
          <ul className="max-h-40 space-y-1 overflow-auto">
            {docs.length === 0 && <li className="text-xs">{S.noModels}</li>}
            {docs.map((d) => (
              <li key={d.document_id} className="flex items-center justify-between gap-2">
                <span className="truncate">{d.title} · {S.version} {d.head_index}</span>
                <Button size="sm" variant="outline" onClick={() => void loadVersion(api, d.head, project).catch((e) => setError(say(e)))}>{S.open}</Button>
              </li>
            ))}
          </ul>
          {current && <p className="text-xs">{S.following}: {current.name} · {S.version} {current.versionIndex}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={openApp}>{S.openApp}</Button>
            <span className="text-xs text-muted-foreground">{selCount} {S.selected}{truncated ? ` · ${S.truncated}` : ''}</span>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
