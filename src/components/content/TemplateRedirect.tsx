'use client';

import { useUITranslation } from "../global/UILocaleProvider";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { templateHref, type TemplateTab } from '../../lib/templateNavigation';

export function TemplateRedirect({ tab }: { tab: TemplateTab }) {
  const { t } = useUITranslation('messages');
  const router = useRouter();
  useEffect(() => { router.replace(templateHref(tab)); }, [router, tab]);
  return <p className="p-8 text-sm text-muted" role="status">{t("messages:uiFeedback.openingTemplates")}</p>;
}
