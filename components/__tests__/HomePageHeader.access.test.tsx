import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

const mockAccess = { canSeeNotifications: true, canSeeInvites: true };
let mockCount = 0;

jest.mock("react-native", () => jest.requireActual("react-native"));
jest.mock("@/lib/alertRegistry/useRegistryNotificationAccess", () => ({
  useRegistryNotificationAccess: () => mockAccess,
  useAccessibleNotificationCount: () => mockCount,
}));
jest.mock("@/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ currentOrganization: { id: "org-1", name: "Acme Logistics" } }),
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, profile: { full_name: "Asha" } }),
}));
jest.mock("@/contexts/DemoTabBarScrollContext", () => ({
  useDemoTabBarVisibilityProgressOptional: () => null,
}));
jest.mock("@/lib/avatarUpload", () => ({ getSignedAvatarUrl: jest.fn(async () => null) }));
jest.mock("react-native-reanimated", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  const identity = (v: unknown) => v;
  return {
    __esModule: true,
    default: { View },
    Easing: { out: identity, quad: identity },
    Extrapolation: { CLAMP: "clamp" },
    cancelAnimation: jest.fn(),
    interpolate: () => 0,
    useAnimatedStyle: () => ({}),
    useSharedValue: (v: unknown) => ({ value: v }),
    withDelay: (_d: number, v: unknown) => v,
    withRepeat: identity,
    withSequence: identity,
    withTiming: identity,
  };
});
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

import { HomePageHeader } from "@/components/HomePageHeader";

describe("HomePageHeader access", () => {
  beforeEach(() => {
    mockAccess.canSeeNotifications = true;
    mockAccess.canSeeInvites = true;
    mockCount = 0;
  });

  it("shows invites and notifications with RBAC-filtered counts", () => {
    mockCount = 3;
    const onInvites = jest.fn();
    const { getByLabelText } = render(
      <HomePageHeader invitationBadgeCount={2} onInvitationsPress={onInvites} />,
    );
    fireEvent.press(getByLabelText("Manage invitations, 2 pending"));
    expect(onInvites).toHaveBeenCalled();
    expect(getByLabelText("Notifications, 3 new")).toBeTruthy();
  });

  it("hides the invites inbox without network access", () => {
    mockAccess.canSeeInvites = false;
    const { queryByLabelText, getByLabelText } = render(
      <HomePageHeader invitationBadgeCount={4} onInvitationsPress={jest.fn()} />,
    );
    expect(queryByLabelText(/Manage invitations/)).toBeNull();
    expect(getByLabelText("Notifications")).toBeTruthy();
  });

  it("hides the bell when the member has no trip or finance access", () => {
    mockAccess.canSeeNotifications = false;
    const { queryByLabelText } = render(<HomePageHeader onInvitationsPress={jest.fn()} />);
    expect(queryByLabelText(/Notifications/)).toBeNull();
  });
});
