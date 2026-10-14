'use client';
import { useEditorControllerContext } from '../../components/global/AppProviders';
import { KnowledgePage } from '../../components/knowledge/KnowledgePage';

export default function KnowledgeRoute() {
  const controller = useEditorControllerContext();
  return <KnowledgePage key={controller.contentLibraryRootSession} root={controller.directory} sessionKey={controller.contentLibraryRootSession}
    isRootCurrent={() => controller.directoryRef.current === controller.directory && controller.contentLibraryRootSessionRef.current === controller.contentLibraryRootSession}
    onSettings={() => controller.navigateView('settings')} onImport={controller.markdownImport.openKnowledge} />;
}
