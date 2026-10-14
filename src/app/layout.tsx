import type { Metadata } from 'next';
import '../styles/globals.css';
import { AppProviders } from '../components/global/AppProviders';
import { AppShell } from '../components/global/AppShell';
import { EDITOR_THEME_BOOTSTRAP_SCRIPT } from '../lib/editorThemeCache';
import { UILocaleProvider } from '../components/global/UILocaleProvider';
import { UI_LOCALE_BOOTSTRAP_SCRIPT } from '../lib/i18n/preferences';

export const metadata: Metadata = {
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="group/theme" data-editor-theme-state="loading" data-ui-locale-state="loading" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: EDITOR_THEME_BOOTSTRAP_SCRIPT }} /><script dangerouslySetInnerHTML={{ __html: UI_LOCALE_BOOTSTRAP_SCRIPT }} /></head>
      <body>
        <UILocaleProvider><AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders></UILocaleProvider>
      </body>
    </html>
  );
}
