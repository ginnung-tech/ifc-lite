/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Client for Ginnung's `/cde/` surface (OpenCDE Foundation + Documents API,
 * plus Ginnung's own project and document listing), with a scoped `client`
 * token as bearer. Contracts `models` and `third-party-auth`.
 *
 * Failure is loud: a non-2xx throws `GinnungApiError` with the server's
 * message; a body that is not the expected shape throws too. An empty list
 * means the user has none, never "the lookup failed".
 */

export class GinnungApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'GinnungApiError';
  }
}

export interface ProjectRow { project_id: string; name: string }

export interface VersionRow {
  document_id: string;
  version_index: number;
  title: string;
  /** Absolute download address (the edge streams the object; a bearer is required). */
  download: string;
}

export interface DocumentRow {
  document_id: string;
  title: string;
  head_index: number;
  head: VersionRow;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseVersion(v: unknown, where: string): VersionRow {
  if (!isObj(v)) throw new GinnungApiError(0, `${where}: not an object`);
  const links = isObj(v.links) ? v.links : {};
  const dl = isObj(links.document_version_download) ? links.document_version_download : {};
  if (typeof v.document_id !== 'string' || typeof v.version_index !== 'number' || typeof dl.url !== 'string') {
    throw new GinnungApiError(0, `${where}: missing document_id, version_index or download link`);
  }
  return { document_id: v.document_id, version_index: v.version_index, title: typeof v.title === 'string' ? v.title : '', download: dl.url };
}

export class GinnungApi {
  constructor(private readonly cde: string, private readonly token: string, private readonly f: Fetch = (i, n) => fetch(i, n)) {}

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith('https://') || path.startsWith('http://') ? path : `${this.cde.replace(/\/+$/, '')}${path}`;
    const res = await this.f(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${this.token}` } });
    if (res.status === 304) return res;
    if (!res.ok) {
      let message = `${res.status}`;
      try {
        const j = await res.json();
        if (isObj(j) && typeof j.message === 'string') message = j.message;
      } catch { /* keep the status */ }
      throw new GinnungApiError(res.status, message);
    }
    return res;
  }

  async listProjects(): Promise<ProjectRow[]> {
    const j = await (await this.call('/ginnung/1.0/projects')).json();
    if (!isObj(j) || !Array.isArray(j.projects)) throw new GinnungApiError(0, 'projects: unexpected answer');
    return j.projects.map((p: unknown) => {
      if (!isObj(p) || typeof p.project_id !== 'string' || typeof p.name !== 'string') throw new GinnungApiError(0, 'projects: bad row');
      return { project_id: p.project_id, name: p.name };
    });
  }

  async listDocuments(project: string): Promise<DocumentRow[]> {
    const j = await (await this.call(`/ginnung/1.0/projects/${encodeURIComponent(project)}/documents`)).json();
    if (!isObj(j) || !Array.isArray(j.documents)) throw new GinnungApiError(0, 'documents: unexpected answer');
    return j.documents.map((d: unknown) => {
      if (!isObj(d) || typeof d.document_id !== 'string' || typeof d.head_index !== 'number') throw new GinnungApiError(0, 'documents: bad row');
      return { document_id: d.document_id, title: typeof d.title === 'string' ? d.title : d.document_id, head_index: d.head_index, head: parseVersion(d.head, 'documents.head') };
    });
  }

  /** The head version of each id, or `null` when `etag` still matches (a 304 costs next to nothing). */
  async heads(ids: readonly string[], etag?: string): Promise<{ etag: string; versions: VersionRow[] } | null> {
    const res = await this.call('/documents/1.0/document-versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-None-Match': etag } : {}) },
      body: JSON.stringify({ document_ids: ids }),
    });
    if (res.status === 304) return null;
    const j = await res.json();
    if (!isObj(j) || !Array.isArray(j.versions)) throw new GinnungApiError(0, 'document-versions: unexpected answer');
    return { etag: res.headers.get('ETag') ?? '', versions: j.versions.map((v: unknown) => parseVersion(v, 'document-versions')) };
  }

  async download(url: string): Promise<ArrayBuffer> {
    return (await this.call(url)).arrayBuffer();
  }
}
