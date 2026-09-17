import type { Project } from '$lib/models/types';
import { readProject } from '$lib/utils/projectValidation';
import { mutateLibrary, ProjectConflictError, type DataStore } from './datastore';
import { sessionUser } from './session';

const newId = () => globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  if (res.status === 409) throw new ProjectConflictError();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const error = new Error(typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`) as Error & { status?: number };
    error.status = res.status;
    if (res.status === 401) sessionUser.set(null); // Expired session: fall back to anonymous handling.
    throw error;
  }
  return res.json().catch(() => null);
}

/**
 * DataStore backed by the self-hosted API. The revision map mirrors the
 * browser store's `opened` map: a save only commits when the server revision
 * still matches what this tab last loaded or wrote.
 */
export function createServerStore(): DataStore {
  const revisions = new Map<string, number | null>();
  const generations = new Map<string, number>();
  let thumbnails: Record<string, string> = {};

  return {
    async has(id) { return (await api(`/api/projects/${encodeURIComponent(id)}/revision`)).revision !== null; },

    async assertCurrent(id) {
      const current = (await api(`/api/projects/${encodeURIComponent(id)}/revision`)).revision;
      if (current !== (revisions.get(id) ?? null)) throw new ProjectConflictError();
    },

    async save(project) {
      const base = revisions.get(project.id) ?? null;
      const raw = JSON.stringify(project);
      const result = await mutateLibrary(async () => base === null
        ? api('/api/projects', { method: 'POST', body: raw })
        : api(`/api/projects/${encodeURIComponent(project.id)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: raw, baseRevision: base }),
          }));
      revisions.set(project.id, result.revision);
    },

    async saveCopy(project, suffix = 'Recovered copy') {
      const copy = readProject(project);
      copy.name = `${copy.name || 'Untitled Project'} (${suffix})`;
      copy.createdAt = copy.updatedAt = new Date();
      let attempts = 0;
      do {
        if (++attempts > 5) throw new Error('Could not choose a new project ID. Try saving a copy again.');
        copy.id = newId();
      } while (await this.has(copy.id));
      await this.save(copy);
      return copy;
    },

    async load(id) {
      generations.set(id, (generations.get(id) ?? 0) + 1);
      const generation = generations.get(id)!;
      let row;
      try {
        row = await api(`/api/projects/${encodeURIComponent(id)}`);
      } catch (error) {
        if ((error as { status?: number }).status === 404) {
          revisions.set(id, null);
          return null;
        }
        throw error;
      }
      if (generation !== generations.get(id)) return null;
      const project = readProject(JSON.parse(row.data));
      if (project.id !== id) throw new Error('The saved project ID does not match its library entry. Download a library backup before recovery.');
      revisions.set(id, row.revision);
      return project;
    },

    async list() {
      const body = await api('/api/projects');
      thumbnails = body.thumbnails ?? {};
      return body.projects ?? [];
    },

    async delete(id) {
      await mutateLibrary(() => api(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }));
      // Keep the stale revision so this tab cannot recreate a deleted plan.
    },

    async duplicate(id) {
      const original = await this.load(id);
      if (!original) return null;
      const dup = await this.saveCopy(original, 'Copy');
      const thumb = await this.getThumbnail(id);
      if (thumb) await this.saveThumbnail(dup.id, thumb);
      return dup;
    },

    async saveThumbnail(id, dataUrl) {
      if ((revisions.get(id) ?? null) === null) return;
      try {
        await api(`/api/projects/${encodeURIComponent(id)}/thumbnail`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        });
      } catch {} // Previews are optional; a failed preview cannot invalidate a saved plan.
    },

    async getThumbnail(id) { return thumbnails[id] ?? null; },
    async getThumbnails() { return thumbnails; },

    async getVersions(id) {
      const row = await api(`/api/projects/${encodeURIComponent(id)}/history`);
      return row?.data ?? null;
    },

    async setVersions(id, raw) {
      await api(`/api/projects/${encodeURIComponent(id)}/history`, {
        method: raw === null ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: raw === null ? undefined : JSON.stringify({ data: raw }),
      });
    },

    // Snapshot appends are last-write-wins over HTTP; the local backend applies
    // the same callback inside one transaction.
    async updateVersions(id, update) {
      await mutateLibrary(async () => {
        const current = await this.getVersions(id);
        await this.setVersions(id, update(current));
      });
    },
  };
}

/** Whole-library backup in the same format the browser store produced. */
export async function downloadServerLibraryBackup() {
  const res = await fetch('/api/library/backup');
  if (!res.ok) throw new Error('Could not download the library backup.');
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cyan-housing-planner-library-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

/** Restore a backup into the signed-in account; the server validates and commits atomically. */
export async function restoreServerLibrary(raw: string, suffix?: string) {
  const query = suffix ? `?suffix=${encodeURIComponent(suffix)}` : '';
  return api(`/api/library/restore${query}`, { method: 'POST', body: raw });
}
