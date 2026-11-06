'use client';

import { useId } from 'react';
import type { GuidePurpose } from '../../lib/entryGuide';

// Paper, tools and illustrations consume the selected editor theme's paint roles.
export function GuideScene({ purpose, profileId, gathering, libraryName = '', autoSave = false, autoSnapshot = false }: { purpose: GuidePurpose | null; profileId: string; gathering: boolean; libraryName?: string; autoSave?: boolean; autoSnapshot?: boolean }) {
  const id = useId().replace(/:/g, '');
  const artwork = ['website', 'brief', 'community'].includes(profileId) ? profileId : purpose ?? 'blank';
  return <div aria-hidden="true" data-gathering={gathering} data-auto-save={autoSave} data-auto-snapshot={autoSnapshot} className="guide-scene group/scene relative aspect-square w-full max-w-120">
    <svg className="size-full overflow-visible" viewBox="0 0 480 480" fill="none">
      <defs>
        <linearGradient id={`${id}-paper`} x1="140" y1="50" x2="350" y2="400" gradientUnits="userSpaceOnUse"><stop stopColor="var(--color-panel)" /><stop offset="1" stopColor="var(--color-hover)" /></linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" x2="1"><stop stopColor="var(--color-muted)" /><stop offset=".32" stopColor="var(--color-hover)" /><stop offset=".65" stopColor="var(--color-faint)" /><stop offset="1" stopColor="var(--color-secondary)" /></linearGradient>
        <linearGradient id={`${id}-folder`} x1="240" y1="334" x2="240" y2="448" gradientUnits="userSpaceOnUse"><stop stopColor="var(--color-panel)" /><stop offset="1" stopColor="color-mix(in oklab, var(--color-hover) 85%, var(--color-accent-soft))" /></linearGradient>
      </defs>
      {/* Geometry rationale: retain the existing illustration easing without changing its opacity timeline. */}
      <g className="transition-opacity duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-data-[gathering=true]/scene:opacity-35 motion-reduce:transition-none"><circle cx="247" cy="241" r="166" className="fill-accent-soft/25" />
      <path d="M78 191c16-73 74-122 145-128M338 391c45-27 72-69 78-119" className="stroke-accent-line/50" strokeWidth="1" strokeLinecap="round" /></g>
      <g className="guide-folder-rise"><path d="M104 295v-16a12 12 0 0 1 12-12h77a13 13 0 0 1 10 5l14 16h154a12 12 0 0 1 12 12v133a12 12 0 0 1-12 12H116a12 12 0 0 1-12-12Z" fill="var(--color-hover)" stroke="var(--color-line-strong)" /><path d="M117 280h72m29 20h151" stroke="var(--color-panel)" strokeOpacity=".5" strokeLinecap="round" /></g>
      <g>
        <g>
          {/* Geometry rationale: the SVG paper pivots at (251,226); rotate/translate keep their original 500/650ms durations and 350ms handoff. */}
          <g className="origin-[251px_226px] -rotate-7 translate-y-0 drop-shadow-(--editor-panel-shadow) transition-[rotate,translate] duration-[500ms,650ms] ease-[cubic-bezier(.22,1,.36,1)] delay-[350ms,0ms] group-data-[gathering=true]/scene:rotate-0 group-data-[gathering=true]/scene:translate-y-6 group-data-[gathering=true]/scene:delay-[0ms,350ms] motion-reduce:transition-none">
            <g transform="translate(285 352)">
              <g data-guide-snapshot="far" className="origin-top-left rotate-0 opacity-0 transition-[opacity,rotate,translate] delay-75 duration-700 ease-out group-data-[auto-snapshot=true]/scene:delay-0 group-data-[auto-snapshot=true]/scene:-translate-x-4 group-data-[auto-snapshot=true]/scene:-translate-y-1 group-data-[auto-snapshot=true]/scene:-rotate-14 group-data-[auto-snapshot=true]/scene:opacity-100 motion-reduce:transition-none">
                <rect x="-146" y="-279" width="224" height="306" rx="10" fill="var(--color-hover)" stroke="var(--color-line-strong)" strokeWidth=".8" />
              </g>
              <g data-guide-snapshot="near" className="origin-top-left rotate-0 opacity-0 transition-[opacity,rotate,translate] duration-700 ease-out group-data-[auto-snapshot=true]/scene:delay-75 group-data-[auto-snapshot=true]/scene:-translate-x-1.5 group-data-[auto-snapshot=true]/scene:-translate-y-0.5 group-data-[auto-snapshot=true]/scene:-rotate-7 group-data-[auto-snapshot=true]/scene:opacity-100 motion-reduce:transition-none">
                <rect x="-146" y="-279" width="224" height="306" rx="10" fill="var(--color-list)" stroke="var(--color-line-strong)" strokeWidth=".8" />
              </g>
            </g>
            <rect x="139" y="73" width="224" height="306" rx="10" fill={`url(#${id}-paper)`} stroke="var(--color-line-strong)" strokeWidth=".8" />
            <path d="M151 83h198" stroke="var(--color-panel)" strokeOpacity=".8" />
            <text x="163" y="110" fontFamily="ui-monospace, monospace" fontSize="13" fontWeight="700" className="fill-primary">R/</text>
            <path d="M192 106h76" className="stroke-line-strong stroke-1" />
            <circle cx="334" cy="105" r="4" className="fill-accent" />
            <g transform="translate(334 105)">
              <g className="scale-75 opacity-0 transition-[opacity,scale] duration-300 group-data-[auto-save=true]/scene:scale-100 group-data-[auto-save=true]/scene:opacity-100 motion-reduce:transition-none">
                <circle data-guide-autosave cx="0" cy="0" r="11" strokeWidth="1.8" strokeDasharray="45 24" strokeLinecap="round" className="stroke-accent animate-guide-autosave [animation-play-state:paused] group-data-[auto-save=true]/scene:[animation-play-state:running] motion-reduce:animate-none" />
              </g>
            </g>
            <path d="M163 125h175" className="stroke-line-strong stroke-1" />
            {/* Geometry rationale: preserve the original 8px artwork lift in the existing SVG coordinate system. */}
            {['blank', 'development', 'website', 'commerce', 'brief', 'media', 'community'].map(scene => <g key={scene} data-artwork={scene} data-active={artwork === scene} className="transform-[translateY(8px)] opacity-0 transition-[opacity,transform] duration-600 ease-[ease] data-[active=true]:transform-[translateY(0)] data-[active=true]:opacity-100 motion-reduce:transition-none">
              {scene === 'development' ? <>
                <text x="161" y="171" fontSize="22" fontFamily="ui-monospace, monospace" fontWeight="600" className="fill-primary">hello, world.</text>
                <path d="M163 189h115" className="stroke-line-strong stroke-1" />
                <rect x="160" y="211" width="181" height="103" rx="6" fill="var(--color-editor-surface)" stroke="var(--color-line-strong)" />
                <circle cx="173" cy="224" r="2" fill="var(--color-muted)" /><circle cx="181" cy="224" r="2" fill="var(--color-muted)" /><circle cx="189" cy="224" r="2" fill="var(--color-muted)" />
                <path d="m183 245-8 7 8 7m20-14 8 7-8 7m-11-17-5 21" stroke="var(--color-editor-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M176 280h24m8 0h50m-72 13h67m7 0h33" stroke="var(--color-editor-syntax)" strokeWidth="3" strokeLinecap="round" />
              </> : scene === 'website' ? <>
                <text x="161" y="174" fontSize="31" fontFamily="Georgia, serif" className="fill-primary">A new page.</text>
                <rect x="163" y="199" width="175" height="107" rx="5" fill="var(--color-list)" stroke="var(--color-line-strong)" />
                <path d="M163 218h175" className="stroke-line-strong stroke-1" /><circle cx="175" cy="209" r="2" className="fill-faint" /><circle cx="182" cy="209" r="2" className="fill-faint" />
                <rect x="174" y="230" width="64" height="62" rx="3" className="fill-accent-soft" />
                <circle cx="205" cy="252" r="12" className="fill-accent/50" /><path d="m180 286 20-23 12 13 12-10 10 20Z" className="fill-accent/30" />
                <path d="M251 235h70m-70 12h57m-57 12h62m-62 25h31" stroke="var(--color-faint)" strokeWidth="3" strokeLinecap="round" />
              </> : scene === 'commerce' ? <>
                <text x="161" y="170" fontSize="30" fontFamily="Georgia, serif" className="fill-primary">Made well.</text>
                <path d="m249 206 47 26-47 27-46-27Z" fill="var(--color-accent-soft)" />
                <path d="m203 232 46 27v52l-46-27Z" fill="var(--color-accent-line)" /><path d="m249 259 47-27v52l-47 27Z" fill="var(--color-accent)" />
                <path d="m225 219 48 26v18" stroke="var(--color-on-accent)" strokeWidth="8" /><path d="M316 222v73m-5-73h10m-10 73h10" stroke="var(--color-faint)" />
                <path d="M164 331h87m10 0h32" stroke="var(--color-faint)" strokeWidth="3" strokeLinecap="round" />
              </> : scene === 'brief' ? <>
                <text x="161" y="171" fontSize="31" fontFamily="Georgia, serif" className="fill-primary">A clear idea.</text>
                <path d="M171 303h158m-158-79v79" className="stroke-line-strong stroke-1" /><rect x="187" y="261" width="23" height="42" rx="3" fill="var(--color-accent-line)" /><rect x="226" y="238" width="23" height="65" rx="3" fill="var(--color-accent)" /><rect x="265" y="211" width="23" height="92" rx="3" fill="var(--color-accent-strong)" />
                <path d="m183 243 50-30 48-24 40 1" stroke="var(--color-accent-text)" strokeWidth="2" /><circle cx="321" cy="190" r="4" fill="var(--color-accent-text)" />
              </> : scene === 'community' ? <>
                <text x="161" y="171" fontSize="31" fontFamily="Georgia, serif" className="fill-primary">Pass it on.</text>
                <path d="M173 205h142a9 9 0 0 1 9 9v63a9 9 0 0 1-9 9h-85l-24 20v-20h-33a9 9 0 0 1-9-9v-63a9 9 0 0 1 9-9Z" fill="var(--color-hover)" stroke="var(--color-line-strong)" />
                <path d="M183 229h118m-118 16h98m-98 16h65" stroke="var(--color-faint)" strokeWidth="3" strokeLinecap="round" />
              </> : scene === 'media' ? <>
                <text x="161" y="176" fontSize="32" fontFamily="Georgia, serif" className="fill-primary">Dear reader,</text>
                <text x="162" y="244" fontSize="68" fontFamily="Georgia, serif" fill="var(--color-line-strong)">“</text>
                <path d="M198 218h136m-136 15h124m-124 15h91M164 283h170m-170 15h151m-151 15h164" stroke="var(--color-faint)" strokeWidth="2.5" strokeLinecap="round" />
              </> : <>
                <text x="159" y="208" fontSize="76" fontFamily="Georgia, serif" letterSpacing="-6" className="fill-primary">Aa</text>
                <path d="M163 237h166m-166 18h148m-148 18h159m-159 18h102" stroke="var(--color-line-strong)" strokeWidth="3" strokeLinecap="round" />
                <path d="M164 329c24-23 35-14 26-5-9 12-8-6 5-8 12-3 10 10 19 5s9-11 16-6" stroke="var(--color-muted)" strokeWidth="1.5" strokeLinecap="round" />
              </>}
            </g>)}
            <path d="M163 350h175" className="stroke-line-strong stroke-1" /><path d="M163 359h25m132 0h18" stroke="var(--color-faint)" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>
        <g>
          {/* Geometry rationale: preserve the approved SVG prop coordinates, rotation, scale and easing. */}
          <g className="transform-[translate(72px,256px)_rotate(-15deg)] drop-shadow-(--editor-panel-shadow) transition-transform duration-750 ease-[cubic-bezier(.22,1,.36,1)] group-data-[gathering=true]/scene:transform-[translate(99px,261px)_rotate(-3deg)_scale(.8)] motion-reduce:transition-none"><rect width="82" height="91" rx="12" fill="var(--color-accent-soft)" stroke="var(--color-accent-line)" /><path d="M15 17h23" stroke="var(--color-accent-line)" strokeWidth="2" strokeLinecap="round" /><path d="M18 40h46m-46 12h37m-37 12h42" stroke="var(--color-accent-text)" strokeWidth="3" strokeLinecap="round" /><circle cx="65" cy="18" r="3" fill="var(--color-accent-text)" /></g>
          {/* Geometry rationale: this prop retains its independent SVG transform and endpoints. */}
          <g className="transform-[translate(379px,160px)_rotate(24deg)] drop-shadow-(--editor-panel-shadow) transition-transform duration-750 ease-[cubic-bezier(.22,1,.36,1)] group-data-[gathering=true]/scene:transform-[translate(373px,189px)_rotate(8deg)_scale(.92)] motion-reduce:transition-none"><rect width="13" height="159" rx="6.5" fill={`url(#${id}-metal)`} /><path d="M0 138h13v21l-6.5 24L0 159Z" fill="var(--color-line-strong)" /><path d="m3 172 3.5 11L10 172Z" fill="var(--color-primary)" /><path d="M3 15v51" stroke="var(--color-panel)" strokeWidth="1.5" strokeLinecap="round" /></g>
        </g>
      </g>
      <g className="guide-folder-rise drop-shadow-(--editor-toggle-shadow)">
        <path d="M106 334h76c7 0 10 3 14 7l7 7h177c8 0 12 6 11 13l-9 74c-.6 8-6 13-14 13H115c-8 0-13-5-14-13L92 349c-.7-8 5-15 14-15Z" fill={`url(#${id}-folder)`} stroke="var(--color-line-strong)" strokeWidth=".8" />
        <path d="M108 341h72c6 0 8 3 12 7l7 7h178" stroke="var(--color-line-strong)" strokeOpacity=".6" strokeLinecap="round" />
        <path d="M113 438h254" stroke="var(--color-line-strong)" strokeOpacity=".5" strokeLinecap="round" />
        <rect x="127" y="376" width="46" height="26" rx="5" fill="var(--color-accent-soft)" stroke="var(--color-accent-line)" strokeWidth=".8" />
        <text x="150" y="394" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="16" fontWeight="600" fill="var(--color-accent-text)">R/</text>
        {libraryName ? <foreignObject x="194" y="371" width="160" height="36"><div className="flex h-full items-center"><span className="block w-full truncate font-sub-heading text-sm text-secondary">{libraryName}</span></div></foreignObject> : <path d="M194 389h146m-146 9h98" stroke="var(--color-muted)" strokeWidth="2" strokeOpacity=".35" strokeLinecap="round" />}
      </g>
    </svg>
  </div>;
}
