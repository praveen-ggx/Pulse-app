/**
 * Organization overview inside the workspace flex-card — same chrome as Account / KYC.
 */
import Layout from '@/constants/Layout';
import { WorkspaceDetailLayout } from '@/features/organization/components/workspace/WorkspaceDetailLayout';
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
  type OrgHubSection,
  type WorkspacePanelId,
} from '@/features/organization/components/workspace/workspacePanelTypes';
import { useOrganization } from '@/contexts/OrganizationContext';
import ProfileScreen from '@/features/organization/screens/ProfileScreen';
import { useWindowDimensions } from 'react-native';

type Props = {
  onBack: () => void;
  onOpenPanel: (panel: WorkspacePanelId) => void;
  onOpenOrgSection: (section: OrgHubSection | null) => void;
  onOpenRoute: (path: string) => void;
};

export function WorkspaceProfilePanel({
  onBack,
  onOpenPanel,
  onOpenOrgSection,
  onOpenRoute,
}: Props) {
  const { currentOrganization } = useOrganization();
  const orgName = (currentOrganization?.name ?? '').trim();
  const { width } = useWindowDimensions();
  const isMobile = width < Layout.workspaceSplitMinWidth;

  const screen = (
      <ProfileScreen
        presentation={isMobile ? 'page' : 'embedded'}
        embedded={!isMobile}
        onClose={onBack}
        onOpenAccount={() => onOpenPanel('account')}
        onOpenTeam={() => onOpenPanel('team')}
        onOpenVerification={() => onOpenOrgSection('verification')}
        onOpenBusinessIdentity={() => onOpenOrgSection('details')}
        onOpenWorkspaceSettings={() => onOpenPanel('settings')}
        onOpenProducts={() => onOpenPanel('products')}
        onOpenScanUsage={() => onOpenPanel('ocr-usage')}
        onOpenRoute={onOpenRoute}
      />
  );

  if (isMobile) return screen;

  return (
    <WorkspaceDetailLayout
      title={orgName || WORKSPACE_PANEL_TITLES.profile}
      subtitle={WORKSPACE_PANEL_SUBTITLES.profile}
      onBack={onBack}
      fillBody
      flushBody
      contentMaxWidth={720}
    >
      {screen}
    </WorkspaceDetailLayout>
  );
}
