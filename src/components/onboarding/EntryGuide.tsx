'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';
import { ContentIcon } from '../global/ContentIcon';
import { TooltipButton } from '../global/TooltipButton';
import { ModeSwitch } from '../global/ModeSwitch';
import { BrandMark } from '../global/BrandMark';
import { GuideWelcome } from './GuideWelcome';
import type { GuideAudioControls } from '../../hooks/useGuideAudio';
import type { EditorAppearance } from '../../lib/editorWorkspace';
import { GuideScene } from './GuideScene';
import { GuideThemeDeck } from './GuideThemeDeck';
import { GuideHandoff } from './GuideHandoff';
import { DEFAULT_EDITOR_THEME, getBuiltinEditorThemes, type EditorTheme } from '../../lib/editorThemes';
import { normalizeDataDirectoryName } from '../../lib/fileSystem';
import { GUIDE_STEPS as S, guideProfile, profilesFor, type GuidePhase, type GuidePlan, type GuidePurpose, type GuideResources, type GuideResult, type GuideWriter } from '../../lib/entryGuide';

type Props = {
  audio?: GuideAudioControls;
  supported: boolean;
  workspaceReady?: boolean;
  workspaceIssue?: string;
  onCreate: (plan: GuidePlan, progress: (phase: GuidePhase) => void) => Promise<GuideResult>;
  onOpen: (progress: (phase: GuidePhase) => void) => Promise<GuideResult>;
  onFinish: (remember: boolean) => void;
  onAppearance: (mode: GuidePlan['colorMode'], themeId?: string) => void;
  onAdoptAppearance?: (appearance: EditorAppearance, theme: EditorTheme) => Promise<boolean>;
};
const purposes = ['development', 'commerce', 'media'] as const;
const steps = ['purpose', 'output', 'writer', 'saving', 'library', 'review'] as const;
type Flight = { id: number; step: number; direction: 'collect' | 'return'; label: string; kind: 'choice' | 'field'; style: CSSProperties };
type ReturnAnchor = { id: number; step: number; label: string; rect: DOMRect };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function FeedbackReveal({ open, children, onReveal }: { open: boolean; children: ReactNode; onReveal?: () => void }) {
  // Geometry rationale: keep the existing 0fr/1fr reveal tracks so content height remains intrinsic.
  return <div className="grid grid-rows-[0fr] opacity-0 data-[open=true]:grid-rows-[1fr] data-[open=true]:opacity-100 motion-safe:data-[open=true]:animate-guide-feedback" data-open={open} onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'guide-feedback-enter') onReveal?.(); }}><div className="min-h-0 overflow-hidden">{children}</div></div>;
}

function GuideNote({ open = true, children }: { open?: boolean; children: ReactNode }) {
  // Geometry rationale: preserve intrinsic 0fr/1fr disclosure rather than constraining note height.
  return <div className="guide-note grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-450 ease-[ease] data-[open=true]:grid-rows-[1fr] data-[open=true]:opacity-100 motion-reduce:transition-none" data-open={open} aria-live="polite"><div className="min-h-0 overflow-hidden [&_p]:mt-5 [&_p]:mb-1 [&_p]:border-l-2 [&_p]:border-accent-line [&_p]:pl-4 [&_p]:text-12_8 [&_p]:text-muted">{children}</div></div>;
}

function decisionElement(step: number): HTMLElement | null {
  if (step === S.language) return document.querySelector('[data-language-title][data-selected=true]');
  if (step === S.appearance) return document.querySelector('.guide-theme-card[aria-pressed=true] [data-theme-title]');
  if (step <= S.writer) return document.querySelector<HTMLInputElement>(`input[name=${step === S.purpose ? 'purpose' : step === S.output ? 'profile' : 'writer'}]:checked`)?.nextElementSibling?.querySelector('[data-choice-title]') ?? null;
  if (step === S.saving) return document.querySelector('[data-saving-summary]');
  return document.getElementById('guide-library-name') ?? document.querySelector('[data-guide-panel] h1');
}

function decisionRect(element: HTMLElement, label: string): DOMRect {
  let rect = element.getBoundingClientRect();
  if (rect.width <= 0) return rect;
  if (element.tagName === 'INPUT') {
    const style = getComputedStyle(element), canvas = document.createElement('canvas').getContext('2d');
    if (canvas) {
      canvas.font = style.font;
      const height = parseFloat(style.lineHeight) || rect.height, left = parseFloat(style.paddingLeft);
      rect = new DOMRect(rect.left + left, rect.top + (rect.height - height) / 2, Math.min(canvas.measureText(label).width, rect.width - left - parseFloat(style.paddingRight)), height);
    }
  } else {
    const range = document.createRange(); range.selectNodeContents(element);
    if (typeof range.getBoundingClientRect === 'function') rect = range.getBoundingClientRect();
  }
  return rect;
}

function CardText({ title, detail, collecting = false }: { title: string; detail: string; collecting?: boolean }) {
  return <span className="min-w-0 flex-1"><span data-choice-title data-collecting={collecting} className="block font-sub-heading text-base font-semibold text-primary data-[collecting=true]:invisible">{title}</span><span className="mt-1 block text-xs-readable text-muted">{detail}</span></span>;
}

function Choice({ name, value, checked, onChange, onPreview, collecting, disabled, title, detail, icon }: {
  name: string; value: string; checked: boolean; onChange: () => void;
  onPreview?: (active: boolean) => void; collecting: boolean; disabled: boolean;
  title: string; detail: string; icon: Parameters<typeof ContentIcon>[0]['name'];
}) {
  const id = `guide-${name}-${value}`;
  const pointerInside = useRef(false);
  return <div className="relative min-w-0" onPointerEnter={() => { pointerInside.current = true; onPreview?.(true); }} onPointerLeave={event => { pointerInside.current = false; onPreview?.(event.currentTarget.contains(document.activeElement)); }} onFocus={() => onPreview?.(true)} onBlur={() => onPreview?.(pointerInside.current)}>
    <input id={id} className="peer sr-only" type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} />
    <label htmlFor={id} className="guide-choice group/choice">
      <span className="guide-choice-icon"><ContentIcon name={icon} /></span>
      <CardText title={title} detail={detail} collecting={collecting} />
      <span aria-hidden="true" data-selected={checked} className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition data-[selected=true]:border-accent data-[selected=true]:bg-accent data-[selected=true]:text-on-accent motion-reduce:transition-none"><ContentIcon name="check" /></span>
    </label>
  </div>;
}

export function EntryGuide({ supported, workspaceReady = true, workspaceIssue, onCreate, onOpen, onFinish, onAppearance, onAdoptAppearance, audio }: Props) {
  const { t } = useUITranslation('onboarding');
  const { locale, setLocale } = useUILocale();
  const [step, setStep] = useState(-2);
  const [welcome, setWelcome] = useState(true);
  const [greeting, setGreeting] = useState<'waiting' | 'wave' | 'typing' | 'settle' | 'reveal' | 'ready'>('waiting');
  const [greetingCount, setGreetingCount] = useState(0);
  const hello = t('hello');
  const greetingExpanded = greeting === 'waiting' || greeting === 'wave' || greeting === 'typing';
  const greetingRowsVisible = greeting === 'reveal' || greeting === 'ready';
  const greetingText = greeting === 'waiting' || greeting === 'wave' ? '' : greeting === 'typing' ? Array.from(hello).slice(0, greetingCount).join('') : hello;
  const surface = useRef<HTMLElement>(null), rememberEntry = useRef(true);
  const [languageChoice, setLanguageChoice] = useState<'zh-CN' | 'en-US' | null>(null);
  const [languageBusy, setLanguageBusy] = useState(false);
  const [purpose, setPurpose] = useState<GuidePurpose | null>(null);
  const [previewPurpose, setPreviewPurpose] = useState<GuidePurpose | null>(null);
  const [previewProfile, setPreviewProfile] = useState<string | null>(null);
  const [profileId, setProfileId] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [writer, setWriter] = useState<GuideWriter | null>(null);
  const [autoSave, setAutoSave] = useState(false);
  const [autoSnapshot, setAutoSnapshot] = useState(false);
  const [colorMode, setColorMode] = useState<GuidePlan['colorMode']>('system');
  const [themeId, setThemeId] = useState('');
  const [systemDark, setSystemDark] = useState(false);
  const dark = colorMode === 'system' ? systemDark : colorMode === 'dark';
  const chosenTheme = getBuiltinEditorThemes(locale).find(theme => theme.id === themeId);
  const appearanceRef = useRef(onAppearance); appearanceRef.current = onAppearance;
  const [completedStep, setCompletedStep] = useState(-3);
  const [railStep, setRailStep] = useState(-3);
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightElement = useRef<HTMLDivElement>(null);
  const [returnAnchor, setReturnAnchor] = useState<ReturnAnchor | null>(null);
  const pendingReturn = useRef<ReturnAnchor | null>(null);
  const flightSerial = useRef(0);
  const [leaving, setLeaving] = useState(false);
  const [sceneLeaving, setSceneLeaving] = useState(false);
  const [direction, setDirection] = useState('forward');
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<GuidePhase>('directory');
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [resumable, setResumable] = useState(false);
  const [resources, setResources] = useState<GuideResources | null>(null);
  const [complete, setComplete] = useState(false);
  const [entering, setEntering] = useState(false);
  const [appearanceFailed, setAppearanceFailed] = useState(false);
  const [panelView, setPanelView] = useState<'steps' | 'preparing' | 'handoff' | 'complete'>('steps');
  const panelTransition = useRef(false);
  const exitRequested = useRef(false), entryReady = useRef(workspaceReady);
  entryReady.current = workspaceReady && !workspaceIssue;
  const handoff = prepared && entryReady.current && mode === 'new' && writer === 'agent';
  const desiredView = complete ? 'complete' : handoff ? 'handoff' : busy ? 'preparing' : 'steps';
  const departing = complete && panelView === 'complete';
  const pendingMove = useRef<(() => void) | null>(null);
  const languageRequest = useRef(false), readyResult = useRef(false), delivered = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const request = useRef(false), alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const journey = useRef<HTMLElement>(null);
  const slotMeasure = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (welcome || greeting === 'ready') return;
    if (reducedMotion() || document.hidden) { setGreeting('ready'); return; }
    if (greeting === 'waiting') { setGreeting('wave'); return; }
    if (greeting === 'typing') {
      if (greetingCount >= Array.from(hello).length) { setGreeting('settle'); return; }
      const timer = window.setTimeout(() => setGreetingCount(count => count + 1), locale === 'zh-CN' ? 100 : 60);
      return () => window.clearTimeout(timer);
    }
    // CSS supplies each visual deadline; the fallback also handles a missed end event.
    const element = surface.current?.querySelector(greeting === 'wave' ? '[data-guide-wave]' : greeting === 'settle' ? '[data-guide-greeting]' : '[data-guide-line=actions]');
    if (!element) return;
    const style = getComputedStyle(element);
    const seconds = greeting === 'settle' ? Number.parseFloat(style.transitionDuration) || 0 : (Number.parseFloat(style.animationDuration) || 0) + (Number.parseFloat(style.animationDelay) || 0);
    const timer = window.setTimeout(() => setGreeting(greeting === 'wave' ? 'typing' : greeting === 'settle' ? 'reveal' : 'ready'), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [welcome, greeting, greetingCount, hello, locale]);
  const selected = guideProfile(profileId);
  let normalized = '', nameIssue = '';
  if (name.trim()) { try { normalized = normalizeDataDirectoryName(name); } catch { nameIssue = t('invalidName'); } }
  const cancelMotion = () => { flightSerial.current++; pendingReturn.current = null; setReturnAnchor(null); setFlight(null); };
  const cancelReturning = () => { if (returnAnchor || flight?.direction === 'return') cancelMotion(); };
  const movingStep = flight?.step ?? returnAnchor?.step;
  const makeFlight = (flightStep: number, label: string, direction: Flight['direction'], element: HTMLElement, origin: DOMRect, target: { left: number; top: number; width: number; height: number }): Flight => {
    const font = getComputedStyle(element);
    return { id: ++flightSerial.current, step: flightStep, direction, label, kind: flightStep === S.library ? 'field' : 'choice', style: {
      left: origin.left, top: origin.top, width: origin.width, height: origin.height,
      fontFamily: font.fontFamily, fontSize: font.fontSize, fontWeight: font.fontWeight, lineHeight: font.lineHeight, letterSpacing: font.letterSpacing,
      '--guide-dx': `${target.left + target.width / 2 - origin.left - origin.width / 2}px`,
      '--guide-dy': `${target.top + target.height / 2 - origin.top - origin.height / 2}px`,
      '--guide-sx': target.width / origin.width, '--guide-sy': target.height / origin.height,
    } as CSSProperties };
  };
  const revealFeedback = () => feedback.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'instant' : 'smooth' });
  const deliver = () => { if (entryReady.current && (readyResult.current || !rememberEntry.current) && exitRequested.current && !delivered.current) { delivered.current = true; onFinishRef.current(rememberEntry.current); } };
  const enterWorkspace = async (remember = true) => {
    if ((remember && !prepared) || !entryReady.current || exitRequested.current) return;
    rememberEntry.current = remember;
    exitRequested.current = true;
    if (onAdoptAppearance) {
      setEntering(true); setAppearanceFailed(false); setError('');
      let adopted = false;
      const selectedTheme = chosenTheme ?? getBuiltinEditorThemes(locale).find(theme => theme.id === DEFAULT_EDITOR_THEME.id)!;
      try { adopted = await onAdoptAppearance({ themeId: selectedTheme.id, colorMode, custom: null }, structuredClone(selectedTheme)); } catch { /* Remain in the guide for retry. */ }
      if (!alive.current) return;
      setEntering(false);
      if (!adopted || !entryReady.current || !exitRequested.current) {
        exitRequested.current = false; setAppearanceFailed(true); setError(t('appearanceSaveFailed')); return;
      }
    }
    setComplete(true);
  };
  useEffect(() => {
    if (!prepared && rememberEntry.current) return;
    if (workspaceIssue) {
      audio?.quiet(); rememberEntry.current = true; readyResult.current = false; exitRequested.current = false; setPrepared(false); setComplete(false); setBusy(false); setMode('existing'); setError(workspaceIssue); return;
    }
    if (!workspaceReady) { audio?.quiet(); exitRequested.current = false; setComplete(false); setBusy(true); return; }
    setBusy(false);
    if (!rememberEntry.current) enterWorkspace(false);
    else if (mode !== 'new' || writer !== 'agent') enterWorkspace();
  }, [prepared, workspaceReady, workspaceIssue, mode, writer]);

  useLayoutEffect(() => {
    if (panelView === desiredView) {
      if (panelTransition.current) {
        panelTransition.current = false; pendingMove.current = null; setLeaving(false); setSceneLeaving(false);
      }
      return;
    }
    // Async preparation uses the same exit/reveal boundary as the configuration pages.
    panelTransition.current = true;
    pendingMove.current = () => {
      panelTransition.current = false; pendingMove.current = null;
      setPanelView(desiredView); setLeaving(false); setSceneLeaving(false);
    };
    setDirection('forward'); setSceneLeaving(true);
    if (reducedMotion()) pendingMove.current();
    else setLeaving(true);
  }, [desiredView, panelView]);

  useEffect(() => {
    if (!panelTransition.current || !leaving) return;
    const reveal = pendingMove.current;
    const panel = surface.current?.querySelector('[data-guide-panel]');
    const duration = panel ? Math.max(...getComputedStyle(panel).transitionDuration.split(',').map(value => Number.parseFloat(value) || 0)) : 0;
    // A fast result can reverse a still-hidden panel before transitionend is emitted.
    const timer = window.setTimeout(() => { if (pendingMove.current === reveal) reveal?.(); }, duration * 1000);
    return () => window.clearTimeout(timer);
  }, [desiredView, panelView, leaving]);

  useEffect(() => {
    if (!departing) return;
    audio?.play();
    if (reducedMotion()) { deliver(); return; }
    const seconds = Number.parseFloat(getComputedStyle(surface.current!).animationDuration) || 0;
    const timer = window.setTimeout(deliver, seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [departing]);

  useEffect(() => {
    alive.current = true;
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const syncScheme = () => setSystemDark(scheme.matches);
    syncScheme(); scheme.addEventListener('change', syncScheme);
    appearanceRef.current('system', DEFAULT_EDITOR_THEME.id);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finishFlight = cancelMotion;
    const syncMotion = () => {
      if (!media.matches) return;
      setGreeting('ready');
      cancelMotion(); pendingMove.current?.();
      feedback.current?.scrollIntoView({ block: 'nearest' });
      if (exitRequested.current) deliver();
    };
    const settleGreeting = () => { if (document.hidden) setGreeting('ready'); };
    document.addEventListener('visibilitychange', settleGreeting);
    window.addEventListener('resize', finishFlight);
    media.addEventListener('change', syncMotion);
    return () => {
      alive.current = false;
      scheme.removeEventListener('change', syncScheme);
      pendingMove.current = null; pendingReturn.current = null;
      window.removeEventListener('resize', finishFlight);
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', settleGreeting);
    };
  }, []);
  useLayoutEffect(() => {
    if (welcome || (step === S.language && greeting !== 'ready')) return;
    if (content.current) content.current.scrollTop = 0;
    if (step === S.appearance) (document.querySelector<HTMLElement>('.guide-theme-card[aria-pressed=true]') ?? document.querySelector<HTMLElement>('.guide-theme-card'))?.focus({ preventScroll: true });
    else heading.current?.focus({ preventScroll: true });
  }, [welcome, greeting, step, panelView]);
  useLayoutEffect(() => {
    if (!flight && !returnAnchor) setRailStep(Math.min(completedStep, step - 1));
  }, [completedStep, step, flight, returnAnchor]);
  useEffect(() => {
    if (!flight) return;
    let frame: number;
    const track = () => {
      if (!alive.current || flightSerial.current !== flight.id) return;
      const animation = flightElement.current?.getAnimations?.().find(item => (item as CSSAnimation).animationName === 'guide-collect');
      const timing = animation?.effect?.getComputedTiming();
      if (!timing || typeof timing.localTime !== 'number' || typeof timing.duration !== 'number' || !timing.duration) return;
      // Keep the rail still until arrival is close, or the returning dot has left it.
      if (timing.localTime / timing.duration >= (flight.direction === 'collect' ? .72 : .12)) setRailStep(flight.direction === 'collect' ? flight.step : flight.step - 1);
      else frame = window.requestAnimationFrame(track);
    };
    frame = window.requestAnimationFrame(track);
    return () => window.cancelAnimationFrame(frame);
  }, [flight]);
  useLayoutEffect(() => {
    const returning = pendingReturn.current;
    if (!returning || returning.step !== step) return;
    const frame = window.requestAnimationFrame(async () => {
      // Theme cards have their own geometry transition; return to their settled label.
      if (step === S.appearance) {
        const card = document.querySelector<HTMLElement>('.guide-theme-card[aria-pressed=true]');
        const deck = document.querySelector<HTMLElement>('.guide-deck');
        const animations = [...(card?.getAnimations?.() ?? []), ...(deck?.getAnimations?.() ?? [])];
        await Promise.allSettled(animations.map(animation => animation.finished));
      }
      if (!alive.current || pendingReturn.current !== returning) return;
      const element = decisionElement(step);
      if (!element || reducedMotion()) { cancelMotion(); return; }
      let target = decisionRect(element, returning.label);
      if (!target.width || !target.height) { cancelMotion(); return; }
      if (step !== S.appearance) {
        const panel = document.querySelector<HTMLElement>('[data-guide-panel]');
        const translate = panel ? (getComputedStyle(panel).translate || '').split(' ').map(Number.parseFloat) : [];
        // The incoming panel is still translating; land at its final text position.
        target = new DOMRect(target.left - (translate[0] || 0), target.top - (translate[1] || 0), target.width, target.height);
      }
      setFlight(makeFlight(step, returning.label, 'return', element, target, returning.rect));
      pendingReturn.current = null; setReturnAnchor(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);
  useEffect(() => { setPreviewPurpose(null); setPreviewProfile(null); }, [step]);
  useEffect(() => {
    if ((!error && !cancelled) || !feedback.current) return;
    if (reducedMotion()) feedback.current.scrollIntoView({ block: 'nearest' });
    feedback.current.focus({ preventScroll: true });
  }, [error, cancelled, panelView]);

  const move = (next: number, reset?: () => void) => {
    if (request.current || complete || resumable) return;
    pendingMove.current = () => { reset?.(); setStep(next); setLeaving(false); setSceneLeaving(false); setError(''); setCancelled(false); pendingMove.current = null; };
    setDirection(next < step ? 'back' : 'forward');
    setSceneLeaving(next < S.purpose || next === S.review);
    if (reducedMotion()) pendingMove.current();
    else setLeaving(true);
  };
  const collect = (element: HTMLElement | null, label: string, next: number) => {
    if (request.current || prepared || resumable || complete || pendingMove.current) return;
    cancelMotion(); setCompletedStep(step);
    const origin = element ? decisionRect(element, label) : null;
    const path = journey.current?.getBoundingClientRect();
    const slot = slotMeasure.current?.getBoundingClientRect();
    const count = nodes.filter(node => node.exists && node.step <= step).length;
    const target = path && slot ? { left: path.left + path.width / 2 + (count - 1) * slot.width / 2 - 4, top: path.top + path.height / 2 - 4, width: 8, height: 8 } : null;
    if (!reducedMotion() && element && origin && target && origin.width > 0 && origin.height > 0) setFlight(makeFlight(step, label, 'collect', element, origin, target));
    move(next);
  };
  const returnTo = (next: number, reset?: () => void) => {
    if (request.current || prepared || resumable || complete || next >= step) return;
    const point = flight?.step === next ? document.querySelector<HTMLElement>('[data-guide-flight]') : document.querySelector<HTMLElement>(`[data-guide-dot="${next}"]`);
    const rect = point?.getBoundingClientRect();
    cancelMotion();
    if (!reducedMotion() && rect?.width && rect.height) {
      const returning = { id: ++flightSerial.current, step: next, label: nodes.find(node => node.step === next)?.label ?? '', rect };
      pendingReturn.current = returning; setReturnAnchor(returning);
    }
    move(next, reset);
  };
  const jumpTo = (next: number) => {
    // A journey-node return retains this decision and clears every later, unsubmitted choice.
    returnTo(next, () => {
      setCompletedStep(next - 1);
      if (next < S.saving) { const enabled = next >= S.writer && writer === 'workspace'; setAutoSave(enabled); setAutoSnapshot(enabled); }
      if (next < S.library) { setName(''); setMode('new'); }
      if (next < S.writer) setWriter(null);
      if (next < S.appearance) { setThemeId(''); setColorMode('system'); onAppearance('system', DEFAULT_EDITOR_THEME.id); }
      if (next < S.output) setProfileId('');
      if (next < S.purpose) setPurpose(null);
    });
  };
  const chooseLanguage = async (value: 'zh-CN' | 'en-US') => {
    if (languageRequest.current || pendingMove.current) return;
    cancelReturning(); languageRequest.current = true; setLanguageBusy(true); setError('');
    try { await setLocale(value); if (alive.current) setLanguageChoice(value); }
    catch { if (alive.current) { setLanguageChoice(null); setError(t('languageFailed')); } }
    finally { languageRequest.current = false; if (alive.current) setLanguageBusy(false); }
  };
  const finish = async (operation = mode) => {
    if (request.current || readyResult.current || (operation === 'new' && (!selected || !writer))) return;
    if (!supported) { setError(t('unsupported')); return; }
    const previousMode = mode;
    setMode(operation);
    request.current = true; setSelecting(true); setError(''); setCancelled(false); setPhase('directory');
    const progress = (next: GuidePhase) => { if (alive.current) { setSelecting(false); setBusy(true); setPhase(next); } };
    try {
      // Invoke the picker in the click's activation; no transition or timer comes first.
      const result = operation === 'existing' ? await onOpen(progress) : await onCreate({ profile: selected!.id, name: normalized, writer: writer!, autoSave, autoSnapshot, colorMode, themeId: themeId || DEFAULT_EDITOR_THEME.id }, progress);
      if (!alive.current) return;
      if (result.status === 'ready') {
        readyResult.current = true;
        setResources(result.resources ?? null); setResumable(false);
        setPrepared(true); setSelecting(false); setBusy(true);
        return;
      }
      if (result.status === 'error') { setError(result.message); setResumable(result.resumable === true); setMode(result.created && !result.resumable ? 'existing' : previousMode); }
      else { setCancelled(true); setMode(previousMode); }
    } catch (cause) { if (alive.current) { setMode(previousMode); setError(cause instanceof Error ? cause.message : String(cause)); } }
    finally { request.current = false; if (alive.current) { setSelecting(false); if (!readyResult.current) setBusy(false); } }
  };
  const nextEnabled = step === S.language ? Boolean(languageChoice) && !languageBusy : step === S.appearance ? Boolean(themeId) : step === S.purpose ? Boolean(purpose) : step === S.output ? Boolean(selected) : step === S.writer ? Boolean(writer) : step === S.library ? mode === 'existing' || Boolean(normalized && !nameIssue) : true;
  const savingLabel = t(autoSave ? autoSnapshot ? 'savingBoth' : 'autoSave' : autoSnapshot ? 'autoSnapshot' : 'savingNeither');
  const proceed = () => {
    if (step === S.review) { void finish(); return; }
    const source = decisionElement(step);
    const label = step === S.language ? languageChoice === 'zh-CN' ? '简体中文' : 'English' : step === S.appearance ? chosenTheme?.name ?? '' : step === S.purpose ? t(`purposes.${purpose}.title`) : step === S.output ? t(`profiles.${profileId}.title`) : step === S.writer ? t(`writers.${writer}.title`) : step === S.saving ? savingLabel : mode === 'new' ? normalized : t('existingLibrary');
    collect(source ?? null, label, step + 1);
  };
  const nodes = [
    { step: -2, label: locale === 'zh-CN' ? '简体中文' : 'English', exists: true },
    { step: -1, label: chosenTheme?.name ?? '', exists: Boolean(themeId) },
    { step: 0, label: purpose ? t(`purposes.${purpose}.title`) : '', exists: Boolean(purpose) },
    { step: 1, label: selected ? t(`profiles.${profileId}.title`) : '', exists: Boolean(selected) },
    { step: S.writer, label: writer ? t(`writers.${writer}.title`) : '', exists: Boolean(writer) },
    { step: S.saving, label: savingLabel, exists: Boolean(writer) },
    { step: S.library, label: mode === 'new' ? normalized : t('existingLibrary'), exists: mode === 'existing' || Boolean(normalized) },
  ];
  const centered = step < 0 || step === S.review || panelView !== 'steps';
  const gathering = step >= S.saving && step <= S.library;
  const toggleAppearance = () => { const next = dark ? 'light' : 'dark'; setColorMode(next); onAppearance(next, themeId || DEFAULT_EDITOR_THEME.id); };
  const nextReady = nextEnabled && (step !== S.language || greeting === 'ready') && !leaving && !languageBusy && !selecting && !flight && !returnAnchor;
  const nextButton = <button className="guide-next guide-next-round motion-safe:data-[ready=true]:animate-guide-ready" type="button" aria-label={t('continue')} data-ready={nextReady} disabled={!nextReady} onClick={proceed}><span className="guide-nav-label" aria-hidden="true"><span>{t('continue')}</span></span><span className="guide-nav-icon"><ContentIcon name={languageBusy ? 'changes' : 'expand'} /></span></button>;
  const backButton = <button className="guide-action guide-next-round" type="button" data-back="true" aria-label={t('back')} disabled={leaving || resumable} onClick={() => returnTo(step === S.appearance ? -2 : mode === 'existing' ? 0 : step - 1)}><span className="guide-nav-icon"><ContentIcon name="collapse" /></span><span className="guide-nav-label" aria-hidden="true"><span>{t('back')}</span></span></button>;
  return <main ref={surface} inert={entering} aria-busy={entering} onClickCapture={audio?.prime} data-entry-guide data-step={step} data-complete={departing} onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'guide-depart' && departing) deliver(); }} className="isolate bg-canvas fixed inset-0 flex h-dvh min-h-0 flex-col overflow-hidden font-sans text-secondary transition-[background-color,color] duration-500 motion-safe:data-[complete=true]:animate-guide-depart motion-reduce:transition-none">
    <div data-guide-ambience data-exit={departing} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 scale-100 overflow-hidden opacity-60 transition-[scale,opacity] duration-700 data-[exit=true]:scale-110 md:opacity-100 motion-reduce:transition-none"><div className="absolute inset-0 animate-guide-environment motion-reduce:animate-none">
      <div className="absolute -left-1/4 -top-1/4 h-full w-full rounded-full bg-radial from-accent/14 via-accent/4 to-transparent to-70% blur-3xl animate-guide-ambient motion-reduce:animate-none" />
      <div className="absolute -bottom-1/3 -right-1/4 h-full w-full rounded-full bg-radial from-accent-soft/70 via-accent/5 to-transparent to-70% blur-3xl animate-guide-ambient-return motion-reduce:animate-none" />
      <div data-guide-windowlight className="absolute -top-1/4 left-0 hidden h-3/2 w-3/4 -rotate-25 grid-cols-2 gap-24 blur-2xl md:grid animate-guide-windowlight motion-reduce:animate-none">
        <span className="bg-linear-to-r from-transparent via-primary/5 to-transparent" /><span className="bg-linear-to-r from-transparent via-primary/4 to-transparent" />
      </div>
    </div></div>
    {welcome ? <GuideWelcome onDone={() => setWelcome(false)} /> : null}
    <div data-guide-content hidden={welcome} inert={welcome} aria-hidden={welcome} className="contents">
    <nav ref={journey} aria-label={t('journey')} className="relative z-30 mx-auto flex h-18 shrink-0 items-center justify-center px-4 md:h-22">
      <span ref={slotMeasure} className="pointer-events-none invisible absolute w-10 md:w-11" />
      {nodes.map(node => {
        const visible = node.exists && completedStep >= node.step && (step > node.step || (flight?.direction === 'collect' && flight.step === node.step));
        const inTransit = movingStep === node.step;
        const disabled = !visible || inTransit || selecting || busy || prepared || resumable || complete || step === node.step;
        return <span key={node.step} data-guide-slot={node.step} data-visible={node.step <= railStep} aria-hidden={!visible} inert={!visible} className="group/journey relative flex h-9 w-0 shrink-0 items-center justify-center transition-[width] duration-200 ease-in-out data-[visible=true]:w-10 md:data-[visible=true]:w-11 motion-reduce:transition-none">
          {/* The tooltip changes wrappers when disabled; keep the fading dot outside it. */}
          <span data-guide-dot={node.step} data-visible={visible || node.step <= railStep} data-hidden={inTransit} className="pointer-events-none absolute size-2 scale-50 rounded-full bg-accent/60 opacity-0 data-[visible=true]:scale-100 data-[visible=true]:opacity-100 data-[hidden=true]:invisible transition-[opacity,scale,background-color] duration-200 ease-in-out group-hover/journey:scale-150 group-hover/journey:bg-accent group-focus-within/journey:scale-150 motion-reduce:transition-none" />
          <TooltipButton tooltip={visible ? node.label : null} aria-hidden={!visible} aria-label={t('returnChoice', { choice: node.label })} disabled={disabled} tabIndex={disabled ? -1 : 0} onClick={() => jumpTo(node.step)} className="absolute flex size-9 items-center justify-center rounded-full text-accent focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent" />
        </span>;
      })}
    </nav>
    <GuideThemeDeck reset={step === S.language} expanded={step === S.appearance} visible={step >= S.appearance && step <= S.library && panelView === 'steps'} selectedId={themeId} gathering={gathering} returning={movingStep === S.appearance} scheme={dark ? 'dark' : 'light'} disabled={leaving || selecting || busy} onSelect={id => { cancelReturning(); setThemeId(id); onAppearance(colorMode, id); }} />
    <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
      <div data-centered={centered} data-themes={step === S.appearance} className="group/layout mx-auto grid h-full min-h-0 w-full max-w-288 grid-cols-1 grid-rows-1 items-center gap-8 px-5 pb-10 pt-3 md:px-12 md:pb-14 lg:grid-cols-12 lg:gap-16 lg:py-10">
        {!centered ? <aside data-scene-anchor data-scene-leaving={sceneLeaving} aria-hidden="true" className="relative hidden aspect-square min-w-0 items-center justify-center opacity-100 transition-[opacity,translate] duration-200 ease-out data-[scene-leaving=true]:translate-y-3 data-[scene-leaving=true]:opacity-0 motion-reduce:transition-none lg:col-span-5 lg:flex"><div className="size-full animate-guide-scene-reveal motion-reduce:animate-none"><GuideScene libraryName={name} purpose={step === S.purpose ? previewPurpose ?? purpose : purpose} profileId={step < 1 ? '' : step === S.output ? previewProfile ?? profileId : profileId} gathering={gathering} autoSave={step >= S.writer && autoSave} autoSnapshot={step >= S.writer && autoSnapshot} /></div></aside> : null}
        <section data-centered={centered} data-themes={step === S.appearance} className="mx-auto flex max-h-full min-h-0 w-full min-w-0 max-w-128 flex-col data-[centered=true]:max-w-144 data-[themes=true]:max-w-none lg:col-span-7 lg:data-[centered=true]:col-span-12">
          <div data-guide-panel data-view={panelView} data-selecting={selecting} data-leaving={leaving} data-direction={direction} inert={leaving || selecting} onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === 'opacity') pendingMove.current?.(); }} className="flex min-h-0 flex-col transition-[opacity,translate] duration-500 ease-out data-[leaving=true]:duration-200 data-[leaving=true]:translate-y-3 data-[direction=back]:data-[leaving=true]:-translate-y-3 data-[leaving=true]:opacity-0 motion-reduce:transition-none">
            {panelView === 'handoff' && selected ? <GuideHandoff name={normalized} profile={selected.id} resources={resources} headingRef={heading} onEnter={() => void enterWorkspace()} error={appearanceFailed ? t('appearanceSaveFailed') : undefined} leaving={leaving || complete || !handoff} /> : step === S.language ? <div className="guide-welcome" data-guide-greeting-stage={greeting}>
              <p data-guide-greeting data-expanded={greetingExpanded} data-hidden={greeting === 'waiting'} onTransitionEnd={event => { if (greeting === 'settle' && event.target === event.currentTarget && event.propertyName === 'font-size') setGreeting('reveal'); }} className="guide-greeting text-base transition-[font-size,line-height,translate] duration-500 data-[expanded=true]:translate-y-24 data-[expanded=true]:text-2xl data-[hidden=true]:invisible md:data-[expanded=true]:translate-y-28 md:data-[expanded=true]:text-3xl motion-reduce:transition-none">
                <span className="sr-only">{hello}</span>
                <span aria-hidden="true" data-waving={greeting === 'wave'} className="inline-block motion-safe:data-[waving=true]:animate-guide-line-reveal"><span data-guide-wave data-waving={greeting === 'wave'} onAnimationEnd={event => { if (greeting === 'wave' && event.animationName === 'guide-wave') setGreeting('typing'); }} className="inline-block origin-bottom-right motion-safe:data-[waving=true]:animate-guide-wave">🖐🏻</span></span>
                <span aria-hidden="true" hidden={greeting === 'waiting' || greeting === 'wave'} className="inline-flex items-center whitespace-nowrap"><span data-guide-typed>{greetingText}</span>{greeting === 'typing' ? <span data-guide-cursor className="ml-1 inline-block motion-safe:animate-guide-cursor">|</span> : null}</span>
              </p>
              <div data-guide-line="brand" data-hidden={!greetingRowsVisible} data-revealing={greeting === 'reveal'} aria-hidden={!greetingRowsVisible} className="guide-wordmark data-[hidden=true]:invisible motion-safe:data-[revealing=true]:animate-guide-line-reveal"><span><BrandMark /></span><h1 ref={heading} tabIndex={-1} data-locale={locale} className="text-3xl data-[locale=en-US]:text-xl md:text-5xl md:data-[locale=en-US]:text-3xl">{locale === 'en-US' ? t('common:app.title').replace(' ', '\n') : t('common:app.title')}</h1></div>
              {/* Geometry rationale: retain 1fr columns and the approved 3px selection ring. */}
              <div data-guide-line="languages" data-hidden={!greetingRowsVisible} data-revealing={greeting === 'reveal'} inert={greeting !== 'ready'} aria-hidden={!greetingRowsVisible} className="data-[hidden=true]:invisible motion-safe:data-[revealing=true]:animate-guide-line-reveal motion-safe:data-[revealing=true]:[animation-delay:300ms]">
                <div className="mx-auto grid max-w-108 grid-cols-[1fr_1fr] gap-3" role="group" aria-label={t('chooseLanguage')} aria-busy={languageBusy}>{(['zh-CN', 'en-US'] as const).map(value => <button key={value} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-3 py-4 text-left text-primary transition-[background,border-color,box-shadow,translate] duration-300 ease-[ease] hover:-translate-y-0.5 hover:border-accent-line aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:shadow-[0_0_0_3px] aria-pressed:shadow-accent/8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:gap-4 md:px-5_4 md:py-4_6 motion-reduce:transition-none" aria-label={value === 'zh-CN' ? '简体中文' : 'English'} disabled={leaving || languageBusy || greeting !== 'ready'} aria-pressed={languageChoice === value} onClick={() => void chooseLanguage(value)}><span className="font-[Georgia,Songti_SC,serif] text-25_6 text-accent" aria-hidden="true">{value === 'zh-CN' ? '文' : 'A'}</span><span data-language-title data-selected={languageChoice === value} data-collecting={movingStep === S.language && languageChoice === value} className="whitespace-nowrap text-14_4 data-[collecting=true]:invisible">{value === 'zh-CN' ? '简体中文' : 'English'}</span></button>)}</div>
                <FeedbackReveal open={Boolean(error)} onReveal={revealFeedback}>{error ? <div key={error} ref={feedback} tabIndex={-1} className="mt-4 motion-safe:animate-guide-reveal text-sm text-danger outline-none" role="alert">{error}</div> : null}</FeedbackReveal>
              </div>
              <div data-guide-line="actions" data-hidden={!greetingRowsVisible} data-revealing={greeting === 'reveal'} inert={greeting !== 'ready'} aria-hidden={!greetingRowsVisible} onAnimationEnd={event => { if (greeting === 'reveal' && event.target === event.currentTarget && event.animationName === 'guide-reveal') setGreeting('ready'); }} className="mt-8 flex justify-center data-[hidden=true]:invisible motion-safe:data-[revealing=true]:animate-guide-line-reveal motion-safe:data-[revealing=true]:[animation-delay:600ms]">{nextButton}</div>
            </div> : step === S.appearance ? <>
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-4"><h1 ref={heading} tabIndex={-1} className="font-heading text-3xl font-semibold tracking-tight text-primary outline-none md:text-4xl">{t('chooseTheme')}</h1><ModeSwitch checked={dark} onToggle={toggleAppearance} label={t('toggleAppearance')} start={<ContentIcon name="sun" />} end={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 15.8A8.8 8.8 0 0 1 8.2 4 8.8 8.8 0 1 0 20 15.8Z" /></svg>} /></header>
              {/* Geometry rationale: preserve the approved 45vh stage with 340px cap and 230px floor. */}
              <div data-theme-stage className="my-8 h-[min(45vh,340px)] min-h-[230px] w-full" />
              <footer className="flex shrink-0 items-center justify-between">{backButton}{nextButton}</footer>
            </> : <>
              {panelView === 'preparing' || panelView === 'complete' ? <div data-guide-outro={departing} className="flex min-h-0 flex-col items-center justify-center py-6 text-center motion-safe:data-[guide-outro=true]:animate-guide-pack" role="status" aria-live="polite"><span data-complete={departing} className="mb-9 block size-18 text-on-accent data-[complete=true]:size-52 md:data-[complete=true]:size-64">{departing ? <GuideScene libraryName={name} purpose={purpose} profileId={profileId} gathering autoSave={autoSave} autoSnapshot={autoSnapshot} /> : <BrandMark />}</span><h1 ref={heading} tabIndex={-1} className="font-heading text-3xl font-semibold text-primary outline-none">{departing ? t(rememberEntry.current ? 'completeTitle' : 'exploreTitle') : t('preparingTitle')}</h1><p className="mt-4 text-sm text-muted">{departing ? t(rememberEntry.current ? mode === 'new' ? 'completeBody' : 'existingCompleteBody' : 'exploreBody') : t(`phases.${phase}`)}</p>{!departing ? <span className="mt-8 flex h-6 items-center gap-2 text-accent" aria-hidden="true"><span className="size-2 motion-safe:animate-pulse rounded-full bg-accent" /></span> : null}</div> : <>
                <header className="shrink-0"><h1 ref={heading} tabIndex={-1} className="font-heading text-3xl font-semibold tracking-tight text-primary outline-none md:text-4xl">{step >= S.library && mode === 'existing' ? t('existingLibrary') : t(`titles.${steps[step]}`)}</h1></header>
                <div ref={content} className="mt-7 min-h-0 overflow-x-clip overflow-y-auto">
                  {step === S.purpose ? <fieldset><legend className="sr-only">{t('titles.purpose')}</legend><div className="grid gap-3">{purposes.map(item => <Choice key={item} name="purpose" value={item} checked={purpose === item} disabled={leaving} collecting={movingStep === S.purpose && purpose === item} onPreview={active => { if (!leaving) setPreviewPurpose(current => active ? item : current === item ? null : current); }} title={t(`purposes.${item}.title`)} detail={t(`purposes.${item}.detail`)} icon={item === 'development' ? 'code' : item === 'commerce' ? 'folder' : 'quote'} onChange={() => { cancelReturning(); if (purpose !== item) setProfileId(''); setPurpose(item); setMode('new'); }} />)}</div><button className="guide-choice group/choice mt-3 border-dashed bg-transparent hover:bg-hover" aria-label={t('alreadyHave')} disabled={leaving || selecting || busy} onClick={() => void finish('existing')}><span className="guide-choice-icon"><ContentIcon name="folder" /></span><CardText title={t('alreadyHave')} detail={t('existingHelp')} /><span className="ml-auto text-muted transition-[translate] duration-300 ease-[ease] group-hover/choice:translate-x-0.75 group-hover/choice:text-accent-text motion-reduce:transition-none"><ContentIcon name="expand" /></span></button></fieldset> : null}
                  {step === S.output && purpose ? <fieldset><legend className="sr-only">{t('titles.output')}</legend><div className="grid gap-3">{profilesFor(purpose).map(profile => <Choice key={profile.id} name="profile" value={profile.id} checked={profileId === profile.id} disabled={leaving} collecting={movingStep === S.output && profileId === profile.id} onPreview={active => { if (!leaving) setPreviewProfile(current => active ? profile.id : current === profile.id ? null : current); }} title={t(`profiles.${profile.id}.title`)} detail={t(`profiles.${profile.id}.detail`)} icon={profile.icon} onChange={() => { cancelReturning(); setProfileId(profile.id); }} />)}</div><GuideNote open={Boolean(selected)}>{selected ? <p key={selected.id} className="motion-safe:animate-guide-reveal">{t(`profiles.${selected.id}.note`)}</p> : null}</GuideNote></fieldset> : null}
                  {step === S.writer ? <fieldset><legend className="sr-only">{t('titles.writer')}</legend><div className="grid gap-3">{(['agent', 'workspace'] as const).map(value => <Choice key={value} name="writer" value={value} checked={writer === value} disabled={leaving} collecting={movingStep === S.writer && writer === value} title={t(`writers.${value}.title`)} detail={t(`writers.${value}.detail`)} icon={value === 'agent' ? 'code' : 'edit'} onChange={() => { cancelReturning(); setWriter(value); setAutoSave(value === 'workspace'); setAutoSnapshot(value === 'workspace'); }} />)}</div><GuideNote open={Boolean(writer)}>{writer ? <p key={writer} className="motion-safe:animate-guide-reveal">{t(`writers.${writer}.recommendation`)}</p> : null}</GuideNote></fieldset> : null}
                  {/* Geometry rationale: the existing library input keeps its 3px focus ring. */}
                  {step === S.library ? <div>
                    {mode === 'new' ? <><div className="grid"><label htmlFor="guide-library-name" className="sr-only">{t('nameLabel')}</label><div className="relative"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted"><ContentIcon name="folder" /></span><input className="w-full min-w-0 rounded-3_6 border border-line bg-panel py-4 pr-4_4 pl-12 text-base text-primary outline-none transition-[border-color,box-shadow] duration-300 ease-[ease] focus:border-accent focus:shadow-[0_0_0_3px] focus:shadow-accent/10 aria-invalid:border-danger data-[collecting=true]:text-transparent data-[collecting=true]:caret-transparent motion-reduce:transition-none" id="guide-library-name" name="libraryName" data-collecting={movingStep === S.library} value={name} onChange={event => { cancelReturning(); setName(event.target.value); }} maxLength={80} placeholder={t('namePlaceholder')} autoComplete="off" aria-invalid={Boolean(nameIssue)} aria-describedby={nameIssue ? 'guide-name-help' : undefined} /></div><FeedbackReveal open={Boolean(nameIssue)}>{nameIssue ? <p id="guide-name-help" className="motion-safe:animate-guide-reveal pt-2 text-xs text-danger">{nameIssue}</p> : null}</FeedbackReveal></div><GuideNote><p>{t('nameHelp')}</p></GuideNote></> : <GuideNote><p>{t('existingHelp')}</p></GuideNote>}
                  </div> : null}
                  {step === S.saving ? <><div className="grid gap-3">{([{ key: 'autoSave', value: autoSave, set: setAutoSave, icon: 'save' }, { key: 'autoSnapshot', value: autoSnapshot, set: setAutoSnapshot, icon: 'changes' }] as const).map(option => <ModeSwitch key={option.key} className="guide-choice group/choice" checked={option.value} onToggle={() => { cancelReturning(); option.set(!option.value); }} label={t(option.key)} showTooltip={false} disabled={leaving} start={null} end={null}><span className="guide-choice-icon"><ContentIcon name={option.icon} /></span><span className="min-w-0 flex-1"><CardText title={t(option.key)} detail={t(`${option.key}Detail`)} /><span className="mt-2 block text-xs text-accent-text">{t(`savingRecommendations.${writer}.${option.key}`)}</span></span></ModeSwitch>)}</div><GuideNote><p><span data-saving-summary data-collecting={movingStep === S.saving} className="data-[collecting=true]:invisible">{savingLabel}</span></p></GuideNote></> : null}
                  {step === S.review && mode === 'existing' ? <div className="flex items-start gap-4 rounded-2xl border border-line bg-panel p-6"><span className="guide-choice-icon"><ContentIcon name="folder" /></span><p className="text-sm text-muted">{t('existingHelp')}</p></div> : step === S.review ? <><div className="overflow-hidden rounded-2xl border border-line bg-panel"><dl className="grid divide-y divide-line">{[[t('summary.space'), mode === 'new' ? normalized : t('existingLibrary')], [t('summary.output'), mode === 'new' && selected ? t(`profiles.${selected.id}.title`) : t('keepCurrent')], [t('summary.starter'), t('starterIncluded')], [t('appearance'), chosenTheme?.name ?? ''], [t('summary.writer'), mode === 'new' && writer ? t(`writers.${writer}.title`) : t('keepCurrent')], [t('autoSave'), mode === 'new' ? t(autoSave ? 'enabled' : 'disabled') : t('keepCurrent')], [t('autoSnapshot'), mode === 'new' ? t(autoSnapshot ? 'enabled' : 'disabled') : t('keepCurrent')]].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-6 p-4 text-sm"><dt className="shrink-0 text-muted">{label}</dt><dd className="min-w-0 break-words text-right font-medium text-primary">{value}</dd></div>)}</dl></div><GuideNote><p>{t('creationHelp')}</p></GuideNote></> : null}
                  <FeedbackReveal open={Boolean(error || cancelled || (!supported && step >= S.saving))} onReveal={revealFeedback}>
                    {error ? <div key={error} ref={feedback} tabIndex={-1} className="mt-5 motion-safe:animate-guide-reveal whitespace-pre-wrap break-words rounded-xl border border-danger/30 bg-panel p-4 text-sm text-danger outline-none" role="alert"><p>{error}</p><p className="mt-2 text-xs text-muted">{t(resumable ? 'resumeHelp' : 'errorHelp')}</p></div>
                      : cancelled ? <div key="cancelled" ref={feedback} tabIndex={-1} className="mt-4 motion-safe:animate-guide-reveal text-sm text-muted outline-none" role="status">{t('cancelled')}</div>
                        : !supported && step >= S.saving ? <p key="unsupported" className="mt-4 motion-safe:animate-guide-reveal text-sm text-warning" role="status">{t('unsupported')}</p> : null}
                  </FeedbackReveal>
                </div>
                {/* Geometry rationale: keep the existing space for the forward button beside the explore action. */}
                <footer className="mt-7 flex shrink-0 items-center justify-between gap-4">{step > 0 ? backButton : <button className="guide-action max-w-[calc(100%-10rem)]" disabled={leaving || !workspaceReady} onClick={() => enterWorkspace(false)}><ContentIcon name="book" />{t('explore')}</button>}{step < S.review ? nextButton : <button className="guide-next" disabled={leaving || selecting || !supported || Boolean(flight || returnAnchor)} onClick={appearanceFailed ? () => void enterWorkspace(rememberEntry.current) : proceed}>{appearanceFailed ? t('retryEntering') : resumable ? t('resumePreparation') : mode === 'new' ? t('create') : t('connect')}<ContentIcon name="expand" /></button>}</footer>
              </>}
            </>}
          </div>
        </section>
      </div>
    </div>
    {returnAnchor ? <span aria-hidden="true" data-guide-return-anchor className="pointer-events-none fixed z-60 rounded-full bg-accent" style={{ left: returnAnchor.rect.left, top: returnAnchor.rect.top, width: returnAnchor.rect.width, height: returnAnchor.rect.height }} /> : null}
    {flight ? <div ref={flightElement} key={flight.id} aria-hidden="true" data-guide-flight data-direction={flight.direction} data-kind={flight.kind} style={flight.style} onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'guide-collect') setFlight(current => current?.id === flight.id ? null : current); }} className="pointer-events-none data-[direction=return]:[animation-direction:reverse] fixed z-60 flex origin-center motion-safe:animate-guide-collect items-center justify-center overflow-hidden whitespace-nowrap rounded-full text-primary">{flight.label}</div> : null}
    </div>
  </main>;
}
