import { packageInputKey, packageInputFor } from './article-format/packageRendering';
import type { PreviewInput } from './previewSnapshot';
import { restorePreviewImageAttributes } from './article-format/previewImages';

export type RenderedCode = { key: string; status: 'pending' | 'ready' | 'error'; code?: string; error?: string };
const INTERNAL = new Set(['data-package-input','data-package-preview','data-package-document','data-source-line','data-preview-code-key','data-article-content-root','data-article-content-body','data-rainy-interactive','data-local-asset-src','data-local-asset-srcset','data-clipboard-src','data-clipboard-srcset','data-asset-state']);

export function renderedCodeMarkup(root: HTMLElement, includeRoot = true): string {
  const template=root.ownerDocument.createElement('template'),clone=root.cloneNode(true) as HTMLElement;template.content.append(clone);
  const original=[root,...root.querySelectorAll<HTMLElement>('*')],copies=[clone,...clone.querySelectorAll<HTMLElement>('*')];
  original.forEach((node,i)=>{
    const target=copies[i];restorePreviewImageAttributes(node,target);
    const src=node.getAttribute('data-local-asset-src'),set=node.getAttribute('data-local-asset-srcset');
    if(src&&node.localName==='img')target.setAttribute('src',src);
    if(set)target.setAttribute('srcset',set);
    for(const attr of [...target.attributes])if(INTERNAL.has(attr.name)||attr.name.startsWith('data-theme-inspection-'))target.removeAttribute(attr.name);
  });
  clone.querySelectorAll('[data-preview-only],script,link[rel="preload"]').forEach(node=>node.remove());
  return includeRoot?clone.outerHTML:clone.innerHTML;
}

export function readRenderedCode(target: HTMLElement | null, darkFrame: HTMLIFrameElement | null, input: PreviewInput, dark: boolean, ready: boolean, issue=''): RenderedCode {
  const identity=packageInputKey(input.parsed.body,input.article.theme,input.snapshot),key=identity+':'+(dark?'dark':'light');
  if(issue)return {key,status:'error',error:issue};
  if(!target)return {key,status:'pending'};
  const error=target.querySelector<HTMLElement>('[data-package-preview] + [role="alert"]');
  if(error?.textContent)return {key,status:'error',error:error.textContent};
  if(input.snapshot.renderer){
    const bound=packageInputFor(target);
    const committed=[target,...target.querySelectorAll<HTMLElement>('[data-package-input]')].some(node=>node.dataset.packageInput===identity);
    // Packages render and commit their own CSS independently of the manual style action.
    if(!committed||!bound||packageInputKey(bound.source,bound.theme,bound.snapshot)!==identity)return {key,status:'pending'};
  }else if(!ready)return {key,status:'pending'};
  let scope: ParentNode=target;
  if(dark&&input.compiledCss){
    const mount=darkFrame?.contentDocument?.querySelector<HTMLElement>('[data-preview-code-key]');
    if(!mount||mount.dataset.previewCodeKey!==identity)return {key,status:'pending'};
    scope=mount;
  }else if(target.querySelector<HTMLElement>('[data-preview-code-key]')?.dataset.previewCodeKey!==identity)return {key,status:'pending'};
  const root=scope.querySelector<HTMLElement>('[data-article-content-root]')??scope.querySelector<HTMLElement>('[data-package-input]')??scope as HTMLElement;
  const includeRoot=root.hasAttribute('data-article-content-root');
  const html=renderedCodeMarkup(root,includeRoot);
  if(!html.trim())return {key,status:'pending'};
  const domRoot=root.getRootNode();
  const styles=(domRoot as ShadowRoot).host?(domRoot as ShadowRoot).querySelectorAll('style[data-article-style]'):root.ownerDocument.head.querySelectorAll('style');
  const css=[...styles].map(node=>node.textContent??'').filter(Boolean).join('\n');
  return {key,status:'ready',code:(css?'<style>\n'+css.replace(/<\/style/gi,'<\\/style')+'\n</style>\n\n':'')+html};
}

/** Observe actual commits and stylesheet changes only, never sample animation frames. */
export function observeRenderedCode(host: HTMLElement,target: HTMLElement,read:()=>RenderedCode,change:(value:RenderedCode)=>void):()=>void {
  let active=true,frame=0;
  const loads=new Map<HTMLIFrameElement,()=>void>();
  const observer=new MutationObserver(schedule);
  function bind(){
    observer.disconnect();
    const observe=(node:Node)=>observer.observe(node,{subtree:true,childList:true,characterData:true,attributes:true});
    observe(host);observe(target);
    const tree=target.getRootNode();if((tree as ShadowRoot).host)observe(tree);
    for(const iframe of host.querySelectorAll<HTMLIFrameElement>('iframe')){
      if(!loads.has(iframe)){const load=()=>schedule();loads.set(iframe,load);iframe.addEventListener('load',load);}
      if(iframe.contentDocument?.documentElement)observe(iframe.contentDocument.documentElement);
    }
  }
  function schedule(){if(!active||frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!active)return;bind();change(read());});}
  bind();change(read());
  return()=>{active=false;observer.disconnect();cancelAnimationFrame(frame);for(const[iframe,load]of loads)iframe.removeEventListener('load',load);};
}
