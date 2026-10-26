'use client';
import { useEffect } from 'react';
import { useEditorControllerContext } from '../../components/global/AppProviders';
import { KnowledgePage } from '../../components/knowledge/KnowledgePage';

export default function KnowledgeRoute() {
  const controller = useEditorControllerContext();
  useEffect(() => { if (controller.directory && !controller.storedArticles.length) void controller.loadStoredArticles(controller.directory).catch(() => {}); }, [controller.directory, controller.contentLibraryRootSession, controller.loadStoredArticles]);
  return <KnowledgePage key={controller.contentLibraryRootSession} root={controller.directory} sessionKey={controller.contentLibraryRootSession}
    isRootCurrent={() => controller.directoryRef.current === controller.directory && controller.contentLibraryRootSessionRef.current === controller.contentLibraryRootSession}
    articles={controller.storedArticles.map(article => ({ id: article.id, title: article.parse.metadata.title || article.folder }))}
    onSettings={() => controller.navigateView('settings')} onImport={controller.markdownImport.openKnowledge} />;
}
