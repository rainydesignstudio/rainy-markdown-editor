import { appAssetPath } from './appBasePath';

export const ARTICLE_EXAMPLE_IMAGE = '/images/article-sample.png';
export const ARTICLE_EXAMPLE_ASSET_URL = appAssetPath(ARTICLE_EXAMPLE_IMAGE);

export function isApplicationExampleImage(source: string): boolean {
  return source === ARTICLE_EXAMPLE_IMAGE || source === ARTICLE_EXAMPLE_ASSET_URL;
}
