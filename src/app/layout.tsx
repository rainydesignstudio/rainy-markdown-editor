import type { Metadata } from 'next';
import { appAssetPath } from '../lib/appBasePath';
import '../styles/globals.css';
import { AppProviders } from '../components/global/AppProviders';
import { AppShell } from '../components/global/AppShell';
import { EDITOR_THEME_BOOTSTRAP_SCRIPT } from '../lib/editorThemeCache';
import { UILocaleProvider } from '../components/global/UILocaleProvider';
import { ToastProvider } from '../components/global/Toast';
import { UI_LOCALE_BOOTSTRAP_SCRIPT } from '../lib/i18n/preferences';

export const metadata: Metadata = {
  icons: { icon: appAssetPath('/icon.svg') },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-US" className="group/theme" data-editor-theme-state="loading" data-ui-locale-state="loading" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: EDITOR_THEME_BOOTSTRAP_SCRIPT }} /><script dangerouslySetInnerHTML={{ __html: UI_LOCALE_BOOTSTRAP_SCRIPT }} /></head>
      <body>
        <UILocaleProvider><ToastProvider initiallyReady={false}><AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders></ToastProvider></UILocaleProvider>
      </body>
    </html>
  );
}
