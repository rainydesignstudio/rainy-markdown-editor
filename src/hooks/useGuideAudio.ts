'use client';

import { useCallback, useEffect, useRef } from 'react';
import { GuideScore } from '../lib/guideScore';
import { appAssetPath } from '../lib/appBasePath';

export function useGuideAudio() {
  const engine = useRef<GuideScore | null>(null);
  const ensure = useCallback(() => {
    if (!engine.current) {
      const context = new AudioContext();
      engine.current = new GuideScore(context, async () => {
        const response = await fetch(appAssetPath('/guide-outro.mp3'));
        if (!response.ok) throw new Error('Cue unavailable');
        return context.decodeAudioData(await response.arrayBuffer());
      });
      engine.current.setHidden(document.hidden);
    }
    return engine.current;
  }, []);
  useEffect(() => {
    const visibility = () => engine.current?.setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); engine.current?.dispose(); engine.current = null; };
  }, []);
  const prime = useCallback(() => {
    try { ensure().unlock(); } catch { /* Audio is optional. */ }
  }, []);
  const play = useCallback(() => {
    try { ensure().play(); } catch { /* Audio is optional. */ }
  }, [ensure]);
  const quiet = useCallback(() => { engine.current?.quiet(); }, []);
  return { prime, play, quiet };
}

export type GuideAudioControls = ReturnType<typeof useGuideAudio>;
