import type { FreelanceJob } from '../types';

export const JOBS_KEY = 'freelanceflow_jobs';
export const MANUAL_KEY = 'konklancer_manual_jobs_v2';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type ProjectSnapshot = { jobs: FreelanceJob[]; writable: boolean };

/** Never overwrite a store that cannot be decoded: it may contain recoverable user data. */
export function loadProjects(storage: StorageLike): ProjectSnapshot {
  let writable = true;
  const read = (key: string): FreelanceJob[] => {
    try {
      const raw = storage.getItem(key);
      if (raw === null) return [];
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id)) throw new Error('Invalid project store');
      return value as FreelanceJob[];
    } catch {
      writable = false;
      return [];
    }
  };
  const merged = new Map<string, FreelanceJob>();
  for (const job of [...read(MANUAL_KEY), ...read(JOBS_KEY)]) merged.set(job.id, job);
  return { jobs: [...merged.values()], writable };
}

export function saveProjects(storage: StorageLike, jobs: FreelanceJob[]): void {
  const protectedJobs = jobs.filter(j => j.isManual || j.pinned || j.id.startsWith('custom-') || j.id.startsWith('manual-'));
  // Write the recovery vault first. A quota error must not replace the main store.
  storage.setItem(MANUAL_KEY, JSON.stringify(protectedJobs));
  storage.setItem(JOBS_KEY, JSON.stringify(jobs));
}
