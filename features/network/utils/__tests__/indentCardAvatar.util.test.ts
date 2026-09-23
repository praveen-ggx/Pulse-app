import { groupSalesOrdersToPlanClients } from "@/features/network/services/fetchExecutionPlanClientNames";
import {
  giveLoadIndentAvatarProps,
  indentClientFacesFromParties,
  resolveGiveLoadClient,
  resolveMergedOrderCardTitle,
} from "@/features/network/utils/indentCardAvatar.util";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { IndentRow } from "@/features/indents";

function client(partial: Partial<ClientRow> & { id: string; name: string }): ClientRow {
  return {
    organization_id: "org-1",
    contact_person: null,
    phone: "",
    email: null,
    address: null,
    gstin: null,
    pan_number: null,
    status: "active",
    created_at: "",
    updated_at: "",
    ...partial,
  } as ClientRow;
}

describe("giveLoadIndentAvatarProps", () => {
  const aero = client({
    id: "c-aero",
    name: "AERO",
    avatar_url: "orgs/aero/logo.png",
    avatar_seed: "seed-aero",
    linked_organization_id: "linked-aero",
  });

  const byId = new Map<string, ClientRow>([[aero.id, aero]]);

  it("resolves CRM client by name when indent has no client_id", () => {
    const load = {
      id: "ind-1",
      client_name: "AERO",
      client_id: null,
    } as IndentRow;

    expect(resolveGiveLoadClient(load, byId)?.id).toBe("c-aero");

    const avatar = giveLoadIndentAvatarProps(load, byId, {
      "linked-aero": { avatarUrl: "https://cdn.example/aero.png", avatarSeed: "x" },
    });
    expect(avatar.organizationImageUrl).toBe("https://cdn.example/aero.png");
    expect(avatar.initialsColorSeed).toBe("client-entity:c-aero");
    expect(avatar.partyName).toBe("AERO");
  });

  it("falls back to client.avatar_url when linked-org map has no logo yet", () => {
    const load = {
      id: "ind-2",
      client_name: "aero",
    } as IndentRow;

    const avatar = giveLoadIndentAvatarProps(load, byId, {});
    expect(avatar.organizationImageUrl).toBe("orgs/aero/logo.png");
    expect(avatar.avatarUrl).toBe("orgs/aero/logo.png");
  });

  it("prefers client_id when present", () => {
    const other = client({
      id: "c-other",
      name: "AERO",
      avatar_url: "other.png",
    });
    const map = new Map<string, ClientRow>([
      [aero.id, aero],
      [other.id, other],
    ]);
    const load = {
      id: "ind-3",
      client_id: "c-other",
      client_name: "AERO",
    } as IndentRow;
    expect(resolveGiveLoadClient(load, map)?.id).toBe("c-other");
  });

  it("uses own-org branding for synthetic merged-order client names", () => {
    const load = {
      id: "ind-merged",
      client_name: "2 merged orders",
      organization_id: "org-1",
    } as IndentRow;

    const avatar = giveLoadIndentAvatarProps(load, byId, {
      "org-1": { avatarUrl: "https://cdn.example/me.png", avatarSeed: "me" },
    }, {
      id: "org-1",
      name: "Pulse Logistics",
      logoUrl: "fallback-logo.png",
    });
    expect(avatar.organizationImageUrl).toBe("https://cdn.example/me.png");
    expect(avatar.partyName).toBe("Pulse Logistics");
    expect(avatar.initialsColorSeed).toBe("org:org-1");
  });

  it("uses the linked trip client when the indent has no CRM client", () => {
    const load = {
      id: "ind-trip",
      client_name: "Unknown",
      client_id: null,
    } as IndentRow;
    const avatar = giveLoadIndentAvatarProps(
      load,
      byId,
      {
        "linked-aero": { avatarUrl: "https://cdn.example/aero.png", avatarSeed: "x" },
      },
      undefined,
      { client_id: "c-aero", client_name: "AERO" },
    );
    expect(avatar.partyName).toBe("AERO");
    expect(avatar.organizationImageUrl).toBe("https://cdn.example/aero.png");
    expect(avatar.initialsColorSeed).toBe("client-entity:c-aero");
  });

  it("builds trip-style faces for merged-order customers", () => {
    const ht = client({
      id: "c-ht",
      name: "HT Foods",
      avatar_url: "ht.png",
      linked_organization_id: "linked-ht",
    });
    const map = new Map<string, ClientRow>([
      [aero.id, aero],
      [ht.id, ht],
    ]);
    const faces = indentClientFacesFromParties(
      [
        { id: "c-aero", name: "AERO" },
        { id: "c-ht", name: "HT Foods" },
        { id: "c-aero", name: "AERO" },
      ],
      map,
      {
        "linked-aero": { avatarUrl: "https://cdn.example/aero.png", avatarSeed: "a" },
        "linked-ht": { avatarUrl: "https://cdn.example/ht.png", avatarSeed: "h" },
      },
    );
    expect(faces).toHaveLength(2);
    expect(faces[0]).toMatchObject({
      id: "c-aero",
      name: "AERO",
      avatar_url: "https://cdn.example/aero.png",
    });
    expect(faces[1]).toMatchObject({
      id: "c-ht",
      name: "HT Foods",
      avatar_url: "https://cdn.example/ht.png",
    });
  });

  it("uses the linked trip client for synthetic merged names when no pile is built", () => {
    const load = {
      id: "ind-merged-trip",
      client_name: "2 merged orders",
      organization_id: "org-1",
    } as IndentRow;
    const avatar = giveLoadIndentAvatarProps(
      load,
      byId,
      {
        "linked-aero": { avatarUrl: "https://cdn.example/aero.png", avatarSeed: "x" },
      },
      { id: "org-1", name: "Pulse Logistics" },
      { client_id: "c-aero", client_name: "AERO" },
    );
    expect(avatar.partyName).toBe("AERO");
    expect(avatar.organizationImageUrl).toBe("https://cdn.example/aero.png");
  });

  it("uses the CRM name when a merged plan has a single customer", () => {
    expect(
      resolveMergedOrderCardTitle(
        "2 merged orders",
        [{ id: "c-aero", name: "Client" }],
        new Map([["c-aero", { name: "AERO" }]]),
      ),
    ).toBe("AERO");
  });

  it("keeps the merged-orders label when multiple customers remain", () => {
    expect(
      resolveMergedOrderCardTitle("3 merged orders", [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ]),
    ).toBe("3 merged orders");
  });
});

describe("groupSalesOrdersToPlanClients", () => {
  it("dedupes customers on a merged execution plan", () => {
    const grouped = groupSalesOrdersToPlanClients([
      {
        execution_plan_id: "plan-1",
        customer_id: "c-aero",
        customer: { id: "c-aero", name: "AERO" },
      },
      {
        execution_plan_id: "plan-1",
        customer_id: "c-ht",
        customer: { id: "c-ht", legal_name: "HT Foods" },
      },
      {
        execution_plan_id: "plan-1",
        customer_id: "c-aero",
        customer: { id: "c-aero", name: "AERO" },
      },
    ]);
    expect(grouped["plan-1"]?.map((p) => p.id)).toEqual(["c-aero", "c-ht"]);
    expect(grouped["plan-1"]?.[1]?.name).toBe("HT Foods");
  });
});
