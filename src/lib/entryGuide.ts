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
export type GuidePhase = 'directory' | 'template' | 'preferences';
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
