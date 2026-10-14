/**
 * Handlers for adding clients, suppliers, vehicles, drivers and sending invitations.
 * Used by FinanceScreen.
 */
import { createClient } from "@/features/clients/services/clients.service";
import type {
  AddClientFormData,
  ConnectionInviteeMatch,
} from "@/features/clients/components/AddClientModal";
import { createDriver, inviteDriver } from "@/features/drivers/services/drivers.service";
import type { DriverFormData } from "@/features/drivers/components/AddDriverModal";
import {
  createConnectionRequest,
  getConnectionInviteeByPhone,
} from "@/features/connections/services/connectionRequests.service";
import { createSupplier } from "@/features/suppliers/services/suppliers.service";
import type { SupplierFormData } from "@/features/suppliers/components/AddSupplierModal";
import { createVehicle } from "@/features/vehicles/services/vehicles.service";
import type { AddVehicleCompletePayload } from "@/features/vehicles/utils/addVehiclePayload.model";
import { showAppAlert } from "@/lib/appAlert";
import { invalidateFleetDriverConnectionCaches } from "@/lib/invalidateFleetDriverConnectionCaches";
import { queryKeys } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

const NO_ORG_MESSAGE =
  "No organization loaded. Sign out and sign in again to refresh, or ensure you are added as a member of an organization in the dashboard.";

export interface UseFinanceAddEntityHandlersArgs {
  organizationId: string | null;
  organizationName: string | undefined;
  setEntitiesRefreshKey: (fn: (k: number) => number) => void;
  setShowAddClientModal: (v: boolean) => void;
  setShowAddSupplierModal: (v: boolean) => void;
  setShowAddDriverModal: (v: boolean) => void;
}

export interface UseFinanceAddEntityHandlersResult {
  NO_ORG_MESSAGE: string;
  handleAddClientComplete: (data: AddClientFormData) => Promise<void>;
  searchInviteeByPhone: (phone: string) => Promise<ConnectionInviteeMatch | null>;
  handleSendClientInvitation: (toOrgId: string) => Promise<void>;
  handleSendSupplierInvitation: (toOrgId: string) => Promise<void>;
  handleAddVehicleComplete: (payload: AddVehicleCompletePayload) => Promise<void>;
  handleAddDriverInviteComplete: (data: DriverFormData) => Promise<void>;
  handleAddDriverDirect: (data: DriverFormData) => Promise<void>;
  handleAddSupplierComplete: (data: SupplierFormData) => Promise<void>;
}

export function useFinanceAddEntityHandlers(
  args: UseFinanceAddEntityHandlersArgs,
): UseFinanceAddEntityHandlersResult {
  const queryClient = useQueryClient();
  const {
    organizationId,
    organizationName,
    setEntitiesRefreshKey,
    setShowAddClientModal,
    setShowAddSupplierModal,
    setShowAddDriverModal,
  } = args;

  const handleAddClientComplete = useCallback(
    async (data: AddClientFormData) => {
      if (!organizationId) throw new Error(NO_ORG_MESSAGE);
      const { error } = await createClient(organizationId, {
        contact_person: data.contactPerson,
        phone: data.phone,
        organization_name: data.organizationName || undefined,
      });
      if (error) throw error;
      await queryClient.refetchQueries({ queryKey: queryKeys.clients.all(organizationId) });
      setEntitiesRefreshKey((k) => k + 1);
      setShowAddClientModal(false);
    },
    [organizationId, queryClient, setEntitiesRefreshKey, setShowAddClientModal],
  );

  const searchInviteeByPhone = useCallback(async (phone: string) => {
    if (!organizationId) return null;
    const { error, invitee } = await getConnectionInviteeByPhone(
      phone,
      organizationId,
    );
    if (error || !invitee) return null;
    return {
      organization_id: invitee.organization_id,
      full_name: invitee.full_name,
      phone: invitee.phone,
      organization_name: invitee.organization_name,
      profile_company_name: invitee.profile_company_name,
      profile_role: invitee.profile_role,
    };
  }, []);

  const handleSendClientInvitation = useCallback(
    async (toOrgId: string) => {
      if (!organizationId) throw new Error(NO_ORG_MESSAGE);
      const trimmedTo = toOrgId.trim();
      if (!trimmedTo) throw new Error("Missing invitee organization.");
      const { error, alreadyInvited } = await createConnectionRequest(
        organizationId,
        trimmedTo,
        {
          requestShipperClient: true,
          requestCarrierSupplier: false,
        },
      );
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.connectionRequests.sent(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.connectionRequests.received(organizationId),
        }),
      ]);
      setEntitiesRefreshKey((k) => k + 1);
      setShowAddClientModal(false);
      showAppAlert(
        alreadyInvited ? "Already sent" : "Request sent",
        alreadyInvited
          ? "A connection request to this organization is already on file."
          : "They will see your invitation in the app. Pending invites appear on your Customers list.",
      );
    },
    [
      organizationId,
      queryClient,
      setEntitiesRefreshKey,
      setShowAddClientModal,
    ],
  );

  const handleSendSupplierInvitation = useCallback(
    async (toOrgId: string) => {
      if (!organizationId) throw new Error(NO_ORG_MESSAGE);
      const trimmedTo = toOrgId.trim();
      if (!trimmedTo) throw new Error("Missing invitee organization.");
      const { error, alreadyInvited } = await createConnectionRequest(
        organizationId,
        trimmedTo,
        {
          requestShipperClient: false,
          requestCarrierSupplier: true,
        },
      );
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.connectionRequests.sent(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.connectionRequests.received(organizationId),
        }),
      ]);
      setEntitiesRefreshKey((k) => k + 1);
      setShowAddSupplierModal(false);
      showAppAlert(
        alreadyInvited ? "Already sent" : "Request sent",
        alreadyInvited
          ? "A connection request to this organization is already on file."
          : "They will see your invitation in the app.",
      );
    },
    [
      organizationId,
      queryClient,
      setEntitiesRefreshKey,
      setShowAddSupplierModal,
    ],
  );

  const handleAddVehicleComplete = useCallback(
    async (payload: AddVehicleCompletePayload) => {
      if (!organizationId) throw new Error(NO_ORG_MESSAGE);
      const { error } = await createVehicle(organizationId, {
        vehicleSource: payload.vehicleSource,
        vehicle_number: payload.vehicleNumber,
        vehicle_type: payload.vehicleType,
        capacity: payload.capacity,
        vehicle_brand: payload.vehicleBrand ?? null,
        vehicle_model: payload.vehicleModel ?? null,
        vehicle_body_type: payload.vehicleBodyType ?? null,
        vehicle_size: payload.vehicleSize ?? null,
        vehicle_axle: payload.vehicleAxle ?? null,
        documents: payload.documents,
      });
      if (error) throw error;
      await queryClient.refetchQueries({ queryKey: queryKeys.vehicles.all(organizationId) });
      setEntitiesRefreshKey((k) => k + 1);
    },
    [organizationId, queryClient, setEntitiesRefreshKey],
  );

  const handleAddDriverInviteComplete = useCallback(
    async (data: DriverFormData) => {
      if (!organizationId) throw new Error(NO_ORG_MESSAGE);
      const { error, inviteSent, inviteAlreadyExists, inviteStatus } = await inviteDriver(
        organizationId,
        data,
        organizationName,
      );
      if (error) throw error;
      await invalidateFleetDriverConnectionCaches(queryClient, organizationId);
      setEntitiesRefreshKey((k) => k + 1);
      setShowAddDriverModal(false);
      if (!inviteSent) {
        if (inviteAlreadyExists) {
          showAppAlert(
            "Already invited",
            `An invitation was already sent to this driver (${(inviteStatus ?? "pending").toUpperCase()}).`,
          );
          return;
        }
        showAppAlert(
          "Driver added",
          'They\'ll see the invitation in the app once they sign up with this phone number (choose "Driver" when signing up). You can assign trips to them after they accept.',
        );
      }
    },
    [
      organizationId,
      organizationName,
      queryClient,
      setEntitiesRefreshKey,
      setShowAddDriverModal,
    ],
  );

  const handleAddDriverDirect = useCallback(
    async (data: DriverFormData) => {
      if (!organizationId) throw new Error(NO_ORG_MESSAGE);
      const { error } = await createDriver(organizationId, data);
      if (error) throw error;
      await invalidateFleetDriverConnectionCaches(queryClient, organizationId);
      setEntitiesRefreshKey((k) => k + 1);
      setShowAddDriverModal(false);
    },
    [organizationId, queryClient, setEntitiesRefreshKey, setShowAddDriverModal],
  );

  const handleAddSupplierComplete = useCallback(
    async (data: SupplierFormData) => {
      if (!organizationId) throw new Error(NO_ORG_MESSAGE);
      const { error } = await createSupplier(organizationId, {
        company_name: data.companyName || undefined,
        contact_person: data.name,
        phone: data.phone,
      });
      if (error) throw error;
      await queryClient.refetchQueries({ queryKey: queryKeys.suppliers.all(organizationId) });
      setEntitiesRefreshKey((k) => k + 1);
      setShowAddSupplierModal(false);
    },
    [organizationId, queryClient, setEntitiesRefreshKey, setShowAddSupplierModal],
  );

  return {
    NO_ORG_MESSAGE,
    handleAddClientComplete,
    searchInviteeByPhone,
    handleSendClientInvitation,
    handleSendSupplierInvitation,
    handleAddVehicleComplete,
    handleAddDriverInviteComplete,
    handleAddDriverDirect,
    handleAddSupplierComplete,
  };
}
