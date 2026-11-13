/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useEffect, useRef } from 'react';
import { useViewerStore } from '@/store';
import { useIfcLoader } from '@/hooks/useIfcLoader';
import { GinnungApi, GinnungApiError, type DocumentRow, type VersionRow } from '@/lib/ginnung/api';
import { bcfBaseFrom, docsToLoad, modelForSelection, modelRefOf, newerHeads, type LoadedDoc } from '@/lib/ginnung/connection-logic';
import { getFramePeer, subscribeFramePeer } from '@/lib/ginnung/peer';
import { helloMessage, isFromApp, parseAppMessage, selectionMessage } from '@/lib/ginnung/protocol';
import { selectedGlobalIds } from '@/lib/ginnung/selection';
import { ginnungStrings as S } from '@/lib/ginnung/strings';
import { getPaneState, registerPaneActions, resetPaneState, setPaneState } from '@/lib/ginnung/ui-store';

const CDE = import.meta.env.VITE_GINNUNG_CDE_URL as string | undefined;
const APP = import.meta.env.VITE_GINNUNG_APP_URL as string | undefined;
const TOKEN_KEY = 'ginnung-demo.token';
const FOLLOW_MS = 4000;
/** Every Nth follow tick also looks for documents added to the project. */
const NEW_DOCS_EVERY = 5;

function readToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}
function writeToken(v: string): void {
  try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* private window: memory only */ }
}
const say = (e: unknown): string => (e instanceof GinnungApiError ? e.message : e instanceof Error ? e.message : String(e));

/**
 * The Ginnung connection, headless. One token connects both servers at once:
 * the document server (every model of the project is loaded into the viewer and
 * followed to its newest version) and the BCF server (the viewer's own BCF
 * connection, topics pulled). It also speaks contract `viewer-embed` with the
 * app, in the assistant pane's frame or in a popup. The pane (`GinnungPane`)
 * only shows `ui-store` state and calls the actions registered here.
 * Renders nothing, and only when both addresses are configured.
 */
export function GinnungTool() {
  if (!CDE || !APP) return null;
  return <Controller cde={CDE} app={APP} />;
}

function Controller({ cde, app }: { cde: string; app: string }) {
  const { loadFile } = useIfcLoader();
  const apiRef = useRef<GinnungApi | null>(null);
  const projectRef = useRef<{ id: string; name: string } | null>(null);
  const loaded = useRef(new Map<string, LoadedDoc>());
  const etag = useRef<string | undefined>(undefined);
  const popup = useRef<Window | null>(null);
  const appReady = useRef(false);
  const generation = useRef(0);
  const appOrigin = new URL(app).origin;

  const publishModels = useCallback(() => {
    setPaneState({ models: [...loaded.current.values()].map((d) => ({ name: d.name, versionIndex: d.versionIndex })) });
  }, []);

  // ── the app's window and the messages ────────────────────────────────────

  const peerWindow = useCallback((): Window | null => {
    const w = popup.current;
    if (w && !w.closed) return w;
    return getFramePeer();
  }, []);

  const post = useCallback((msg: Record<string, unknown>) => {
    peerWindow()?.postMessage(msg, appOrigin);
  }, [appOrigin, peerWindow]);

  const sendHello = useCallback(() => {
    const first = loaded.current.values().next().value as LoadedDoc | undefined;
    post(helloMessage(first ? modelRefOf(first) : undefined));
  }, [post]);

  const sendSelection = useCallback(() => {
    const st = useViewerStore.getState();
    const ids = selectedGlobalIds(st as never);
    if (appReady.current) {
      const selected = st.selectedEntities.length > 0 ? st.selectedEntities : st.selectedEntity ? [st.selectedEntity] : [];
      const doc = modelForSelection(selected, loaded.current);
      post(selectionMessage(ids.globalIds, doc ? modelRefOf(doc) : undefined, ids.elements));
    }
  }, [post]);

  // ── the BCF leg: the viewer's own connection, same host, same token ──────

  const refreshBcf = useCallback(async (): Promise<void> => {
    const project = projectRef.current;
    if (!project) return;
    try {
      // Loaded on use: a static import changes the production chunk graph (see App.tsx).
      const { pullBcfServerProject } = await import('@/services/bcf-server');
      const result = await pullBcfServerProject(project.id, project.name);
      useViewerStore.getState().setBcfProject(result.project);
      setPaneState({ bcf: { state: 'connected', message: '', topics: result.project.topics.size } });
    } catch (e) {
      console.warn('[ginnung] BCF topics could not be pulled', e);
      setPaneState({ bcf: { state: 'failed', message: say(e), topics: 0 } });
    }
  }, []);

  const connectBcf = useCallback(async (token: string): Promise<void> => {
    setPaneState({ bcf: { state: 'connecting', message: '', topics: 0 } });
    try {
      const base = bcfBaseFrom(cde);
      if (!base) throw new Error(S.bcfBadAddress);
      const { signInWithToken } = await import('@/services/bcf-server');
      await signInWithToken(base, token);
    } catch (e) {
      console.warn('[ginnung] BCF sign-in failed', e);
      setPaneState({ bcf: { state: 'failed', message: say(e), topics: 0 } });
      return;
    }
    await refreshBcf();
  }, [cde, refreshBcf]);

  // ── loading and following models ─────────────────────────────────────────

  /** Download one version and show it, replacing the previous version of the same document. */
  const showDoc = useCallback(async (a: GinnungApi, v: VersionRow, first: boolean): Promise<void> => {
    const bytes = await a.download(v.download);
    const prev = loaded.current.get(v.document_id);
    if (prev) useViewerStore.getState().removeModel(prev.modelId);
    const modelId = crypto.randomUUID();
    const name = `${v.title || 'model'}`.replace(/\.ifc$/i, '') + '.ifc';
    const file = new File([bytes], name, { type: 'application/x-step' });
    // A primary load replaces everything in the viewer: only when it is empty.
    const primary = first && useViewerStore.getState().models.size === 0;
    await loadFile(file, primary ? { kind: 'primary', modelId } : { kind: 'federated', modelId, name });
    loaded.current.set(v.document_id, { documentId: v.document_id, modelId, name, versionIndex: v.version_index });
    publishModels();
  }, [loadFile, publishModels]);

  const loadProject = useCallback(async (a: GinnungApi, projectId: string, gen: number): Promise<void> => {
    const rows: DocumentRow[] = await a.listDocuments(projectId);
    if (gen !== generation.current) return;
    let first = loaded.current.size === 0;
    for (const row of docsToLoad(rows, loaded.current)) {
      try {
        await showDoc(a, row.head, first);
        first = false;
      } catch (e) {
        // One model that cannot be shown must not hide the rest.
        console.warn('[ginnung] a model could not be loaded', row.document_id, e);
        setPaneState({ error: `${row.title}: ${say(e)}` });
      }
      if (gen !== generation.current) return;
    }
    sendHello();
  }, [showDoc, sendHello]);

  // Follow: one conditional request every few seconds; now and then look for new documents.
  useEffect(() => {
    let busy = false;
    let tick = 0;
    const id = setInterval(async () => {
      const a = apiRef.current;
      const project = projectRef.current;
      if (busy || !a || !project || loaded.current.size === 0) return;
      busy = true;
      const gen = generation.current;
      try {
        tick += 1;
        const res = await a.heads([...loaded.current.keys()], etag.current);
        if (gen !== generation.current) return;
        let changed = false;
        if (res) {
          etag.current = res.etag;
          for (const docId of newerHeads(res.versions, loaded.current)) {
            const head = res.versions.find((v) => v.document_id === docId);
            if (head) { await showDoc(a, head, false); changed = true; }
          }
        }
        if (tick % NEW_DOCS_EVERY === 0) {
          const before = loaded.current.size;
          await loadProject(a, project.id, gen);
          if (loaded.current.size !== before) { etag.current = undefined; changed = true; }
        }
        if (changed) { sendHello(); void refreshBcf(); }
      } catch (e) {
        setPaneState({ error: say(e) });
      } finally { busy = false; }
    }, FOLLOW_MS);
    return () => clearInterval(id);
  }, [showDoc, loadProject, sendHello, refreshBcf]);

  // ── actions the pane can ask for ─────────────────────────────────────────

  const connect = useCallback(async (rawToken: string): Promise<void> => {
    const token = rawToken.trim();
    if (!token) return;
    const gen = ++generation.current;
    setPaneState({ phase: 'connecting', error: '', bcf: { state: 'off', message: '', topics: 0 } });
    try {
      const a = new GinnungApi(cde, token);
      const rows = await a.listProjects();
      if (gen !== generation.current) return;
      if (rows.length === 0) throw new Error(S.noProjects);
      apiRef.current = a;
      writeToken(token);
      const projects = rows.map((p) => ({ id: p.project_id, name: p.name }));
      const first = projects[0]!;
      projectRef.current = first;
      loaded.current = new Map();
      etag.current = undefined;
      setPaneState({ phase: 'connected', projects, projectId: first.id, models: [] });
      // Both servers at once: a failure on one is reported on its own and does not stop the other.
      await Promise.allSettled([loadProject(a, first.id, gen), connectBcf(token)]);
    } catch (e) {
      if (gen !== generation.current) return;
      apiRef.current = null;
      if (e instanceof GinnungApiError && e.status === 401) writeToken('');
      setPaneState({ phase: 'disconnected', error: say(e) });
    }
  }, [cde, loadProject, connectBcf]);

  const selectProject = useCallback(async (id: string): Promise<void> => {
    const a = apiRef.current;
    const project = getPaneState().projects.find((p) => p.id === id);
    if (!a || !project) return;
    const gen = ++generation.current;
    const st = useViewerStore.getState();
    for (const d of loaded.current.values()) st.removeModel(d.modelId);
    loaded.current = new Map();
    etag.current = undefined;
    projectRef.current = project;
    setPaneState({ projectId: id, models: [], error: '' });
    await Promise.allSettled([loadProject(a, id, gen), refreshBcf()]);
  }, [loadProject, refreshBcf]);

  const disconnect = useCallback((): void => {
    generation.current += 1;
    apiRef.current = null;
    projectRef.current = null;
    loaded.current = new Map();
    etag.current = undefined;
    writeToken('');
    void import('@/services/bcf-server-config').then((m) => m.clearBcfServerConfig());
    useViewerStore.getState().setBcfProject(null);
    resetPaneState();
  }, []);

  const openWindow = useCallback((): void => {
    const width = 420;
    const left = Math.max(0, window.screenX + window.outerWidth - width);
    const w = window.open(app, 'ginnung-app', `popup=yes,width=${width},height=${window.outerHeight},left=${left},top=${window.screenY}`);
    if (!w) { setPaneState({ error: S.appBlocked }); return; }
    popup.current = w;
    appReady.current = false;
  }, [app]);

  useEffect(() => {
    registerPaneActions({ connect, disconnect, selectProject, openWindow });
    return () => registerPaneActions(null);
  }, [connect, disconnect, selectProject, openWindow]);

  // A saved token reconnects on its own; a revoked one says so in the pane.
  useEffect(() => {
    const saved = readToken();
    if (saved) void connect(saved);
    return () => { generation.current += 1; };
  }, [connect]);

  // ── messages from the app: only from its window, at its exact origin ─────

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (!isFromApp(ev, popup.current, appOrigin) && !isFromApp(ev, getFramePeer(), appOrigin)) return;
      const parsed = parseAppMessage(ev.data);
      if (!parsed.ok) { console.warn(`[ginnung] dropped a message from the app: ${parsed.reason}`); return; }
      const msg = parsed.msg;
      if (msg.type === 'ready') {
        appReady.current = true;
        sendHello();
        sendSelection();
        return;
      }
      const a = apiRef.current;
      const known = loaded.current.get(msg.documentId);
      if (a && known && msg.versionIndex > known.versionIndex) {
        a.heads([msg.documentId]).then(async (res) => {
          const head = res?.versions.find((v) => v.document_id === msg.documentId);
          if (head && head.version_index >= msg.versionIndex) {
            await showDoc(a, head, false);
            sendHello();
            void refreshBcf();
          }
        }).catch((e) => setPaneState({ error: say(e) }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [appOrigin, sendHello, sendSelection, showDoc, refreshBcf]);

  useEffect(() => useViewerStore.subscribe(sendSelection), [sendSelection]);

  // A frame that (re)loads is a new app instance: it announces itself again.
  useEffect(() => subscribeFramePeer(() => { appReady.current = false; }), []);

  useEffect(() => () => { popup.current?.close(); }, []);

  return null;
}
