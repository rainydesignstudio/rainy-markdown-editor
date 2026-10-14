import changelog from '../../../resources/changelog.json' with { type: 'json' };

export type Release = (typeof changelog)[number];
export const releaseTextKey = (version: string) => 'v' + version.replaceAll('.', '_');

// The original chronological log owns Chinese wording and all version/status metadata.
// Runtime resources are derived, so the Chinese history is not maintained twice.
export const chineseReleaseTexts = Object.fromEntries(changelog.map(release => [releaseTextKey(release.version), {
  summary: release.summary,
  ...(release.sections ? { sections: release.sections.map(section => ({ title: section.title, items: section.items })) } : {}),
}]));
