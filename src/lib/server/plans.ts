import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PlanDef {
  /** Base project quota for the plan (before admin-granted bonus slots). */
  projectLimit: number;
}

/** Built-in fallbacks — plans.json (or PLANS_FILE) only needs to list deltas. */
const BUILTIN: Record<string, PlanDef> = {
  free: { projectLimit: 50 },
  pro: { projectLimit: 200 },
};

let cached: Record<string, PlanDef> | null = null;

/**
 * Plan catalog. Reads PLANS_FILE (default: ./plans.json) once at boot —
 * the file maps cleanly into the container with -v ./plans.json:/app/plans.json.
 * Accepts either `{ "plans": { name: {...} } }` or a bare `{ name: {...} }`.
 * MAX_PROJECTS_PER_USER still overrides the free allowance for back-compat.
 */
export function plansConfig(): Record<string, PlanDef> {
  if (cached) return cached;
  const merged: Record<string, PlanDef> = { ...BUILTIN };
  const file = resolve(process.env.PLANS_FILE || 'plans.json');
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      const defs = (raw && typeof raw === 'object' && raw.plans && typeof raw.plans === 'object')
        ? raw.plans : raw;
      for (const [name, def] of Object.entries(defs ?? {})) {
        const limit = (def as PlanDef | undefined)?.projectLimit;
        if (Number.isInteger(limit) && (limit as number) > 0) merged[name] = { projectLimit: limit as number };
      }
    }
  } catch (error) {
    console.error(`[cyan] could not read ${file} — using built-in plan defaults:`, error);
  }
  const freeOverride = Number(process.env.MAX_PROJECTS_PER_USER);
  if (Number.isInteger(freeOverride) && freeOverride > 0) merged.free = { projectLimit: freeOverride };
  cached = merged;
  return merged;
}

/** Plan ids admins may assign, ordered with 'free' first. */
export function knownPlans(): string[] {
  return Object.keys(plansConfig()).sort((a, b) => (a === 'free' ? -1 : b === 'free' ? 1 : 0));
}

/**
 * The plan a row actually counts against: a paid plan without a recorded
 * expiry, or past it, behaves as 'free' — 'free' is always the floor.
 */
export function effectivePlan(plan: string, planExpiresAt: number | null, now = Date.now()): string {
  if (plan === 'free' || !(plan in plansConfig())) return 'free';
  if (planExpiresAt === null || planExpiresAt <= now) return 'free';
  return plan;
}

export function planLimit(plan: string): number {
  const cfg = plansConfig();
  return cfg[plan]?.projectLimit ?? cfg.free.projectLimit;
}

/** Test hook: re-read the file. */
export function resetPlansForTests(): void {
  cached = null;
}
