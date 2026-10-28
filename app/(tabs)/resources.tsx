import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: ResourcesTab } = createPreloadedTabRoute(
  () => import('@/features/fleet/screens/ResourcesScreen'),
  'resources',
);

export default ResourcesTab;
