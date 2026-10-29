/** Host assets use the deployment prefix; user-authored library paths do not. */
export const APP_BASE_PATH = (process.env.NEXT_PUBLIC_ARTICLE_BASE_PATH || '').replace(/\/+$/, '');
export const appAssetPath = (path: string): string => APP_BASE_PATH + path;
