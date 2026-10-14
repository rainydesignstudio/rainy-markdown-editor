export type StylesheetsPolicy = { entry: string; publicRoot: string; allowUnknownClasses?: boolean };
/** Legacy render records infer their source without rewriting stored JSON. */
export function articleDarkMode(formatter: { preview: { dark: { mode?: 'algorithm' | 'tokens'; transform: string } } }): 'algorithm' | 'tokens' {
  return formatter.preview.dark.mode ?? (formatter.preview.dark.transform === 'preserve' ? 'tokens' : 'algorithm');
}
export type RenderContainer = { tag: string; id?: string; classes: string[] };
export type RenderDocumentPolicy = {
  root: RenderContainer;
  body: RenderContainer | null;
  beforeHtml: string;
  afterHtml: string;
  language: string;
  preserveIds: boolean;
  viewport: { width: number; height: number; contentWidth: number } | null;
};
export type RenderNodePolicy = {
  image: { width: number; height: number; classes: string[]; style: Record<string, string>; alt: string };
  link: { classes: string[]; rootBase: string; externalTarget: '_blank' | '_self' };
};
export type CodeLayoutPolicy = {
  wrapperClasses: string[];
  preTag: 'div' | 'pre';
  contentClasses: string[];
  copyClasses: string[];
  copyHtml: string;
  copyLabel: string;
};
export type PrismStylePolicy = Record<string, Record<string, string>>;
