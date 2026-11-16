export const GUIDE_STORAGE_KEY = 'rainy-entry-guide-v1';
export const GUIDE_PROFILES = [
  { id: 'technical', purpose: 'development', preset: 'empty', icon: 'code', sections: ['context', 'environment', 'implementation', 'verification', 'next'] },
  { id: 'website', purpose: 'development', preset: 'empty', icon: 'document', sections: ['intro', 'content', 'images', 'links'] },
  { id: 'product', purpose: 'commerce', preset: 'empty', icon: 'folder', sections: ['overview', 'features', 'specifications', 'images', 'next'] },
  { id: 'brief', purpose: 'commerce', preset: 'empty', icon: 'book', sections: ['context', 'goals', 'value', 'evidence', 'next'] },
  { id: 'wechat', purpose: 'media', preset: 'wechat-article', icon: 'quote', sections: ['intro', 'content', 'ending'] },
  { id: 'community', purpose: 'media', preset: 'empty', icon: 'document', sections: ['question', 'points', 'context', 'links', 'discussion'] },
] as const;
export type GuidePurpose = (typeof GUIDE_PROFILES)[number]['purpose'];
export type GuideProfileId = (typeof GUIDE_PROFILES)[number]['id'];
export type GuideWriter = 'agent' | 'workspace';
export const GUIDE_STEPS = { language: -2, appearance: -1, purpose: 0, output: 1, writer: 2, saving: 3, library: 4, review: 5 } as const;
export type GuidePlan = { profile: GuideProfileId; name: string; writer: GuideWriter; autoSave: boolean; autoSnapshot: boolean; themeId: string; colorMode: 'system' | 'light' | 'dark' };
export type GuideResources = { templatePath: string; samplePath: string; themeId: string; themeVersion: string; autoSave: boolean; autoSaveIntervalSeconds: number; autoSnapshot: boolean; autoSnapshotIntervalMinutes: number; autoSnapshotMaxCount: number };
export type GuideResult = { status: 'ready'; resources?: GuideResources } | { status: 'cancelled' } | { status: 'error'; message: string; created?: boolean; resumable?: boolean };
export type GuidePhase = 'directory' | 'template' | 'preferences' | 'fonts' | 'workspace';
export type GuidePreparationProgress = { completedBytes: number; totalBytes: number; localReady: boolean; fontsReady: boolean; preloadAtStart?: number };
export type GuideProgress = (phase: GuidePhase, progress?: Partial<GuidePreparationProgress>) => void;
export const GUIDE_OUTRO = Object.freeze({ hold: 3000, welcomeHold: 1800, collapse: 400, fade: 300, reducedFade: 150, overlap: 300 });
export type GuideOutroClock = { startedAt: number; reduced: boolean };
export function guideOutroDuration(reduced: boolean, hold: number = GUIDE_OUTRO.hold): number {
  return hold + (reduced ? GUIDE_OUTRO.reducedFade : GUIDE_OUTRO.collapse + GUIDE_OUTRO.fade);
}
export function guideOutroState(clock: GuideOutroClock | null, now: number) {
  const elapsed = clock ? Math.max(0, now - clock.startedAt) : -1;
  return {
    closing: elapsed >= GUIDE_OUTRO.hold,
    fading: elapsed >= GUIDE_OUTRO.hold + (clock?.reduced ? 0 : GUIDE_OUTRO.collapse),
    removed: clock !== null && elapsed >= guideOutroDuration(clock.reduced),
  };
}
/** Preserve the visible anchor; share only its remaining interval between unfinished stages. */
export function guidePreparationPercent(download: { loaded: number; total: number }, local: Partial<GuidePreparationProgress>, ready: boolean): number | null {
  if (ready) return 100;
  if (!Number.isFinite(local.totalBytes) || local.totalBytes! < 0) return null;
  const prepared = local.totalBytes === 0 ? Number(local.localReady === true)
    : Math.min(1, Math.max(0, (local.completedBytes ?? 0) / local.totalBytes!));
  const anchor = local.preloadAtStart;
  let ratio = prepared;
  if (Number.isFinite(anchor) && anchor! >= 0 && anchor! < 1) {
    if (!Number.isFinite(download.total) || download.total <= 0) return null;
    const downloaded = local.fontsReady ? 1 : Math.min(1, Math.max(0, download.loaded / download.total));
    ratio = anchor! + (1 - anchor!) * (Math.max(0, downloaded - anchor!) + prepared) / (2 - anchor!);
  }
  return Math.min(99, Math.floor(ratio * 100));
}
export const guideProfile = (id: string) => GUIDE_PROFILES.find(profile => profile.id === id);
export const profilesFor = (purpose: GuidePurpose) => GUIDE_PROFILES.filter(profile => profile.purpose === purpose);

export function readGuideCompletion(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const value = JSON.parse(storage?.getItem(GUIDE_STORAGE_KEY) ?? 'null');
    return value?.version === 1 && value?.completed === true;
  } catch { return false; }
}

export function rememberGuideCompletion(storage: Pick<Storage, 'setItem'> | null): void {
  try { storage?.setItem(GUIDE_STORAGE_KEY, JSON.stringify({ version: 1, completed: true })); } catch { /* The workspace stays usable without browser preference storage. */ }
}

export function guideTemplateSource(title: string, headings: readonly string[], theme: { id: string; version: string }, now = new Date().toISOString()): string {
  return ['---', `title: ${JSON.stringify(title)}`, 'author: ""', 'description: ""', 'categories: []', `createdAt: ${JSON.stringify(now)}`, `updatedAt: ${JSON.stringify(now)}`, 'theme:', `  id: ${JSON.stringify(theme.id)}`, `  version: ${JSON.stringify(theme.version)}`, '---', '', ...headings.flatMap(heading => [`## ${heading}`, '', '']), ''].join('\n');
}

export function guideSampleSource(title: string, body: string, theme: { id: string; version: string }, now = new Date().toISOString()): string {
  return guideTemplateSource(title, [], theme, now) + body.trim() + '\n';
}
