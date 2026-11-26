jest.mock("@/lib/supabase", () => ({
  supabase: jest.fn(),
}));

import { supabase } from "@/lib/supabase";
import { createTeamChannel } from "../teamChannel.service";
import { normalizeTeamChannelKey } from "../../utils/teamChannelSlug.util";

const mockedSupabase = supabase as jest.MockedFunction<typeof supabase>;

describe("teamChannel.service", () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockedSupabase.mockReturnValue({ rpc } as never);
  });

  it("rejects empty channel names before hitting the RPC", async () => {
    await expect(
      createTeamChannel({ organizationId: "org-1", name: "!!!" }),
    ).rejects.toThrow(/Enter a channel name/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates a channel with normalized key and public visibility", async () => {
    rpc.mockResolvedValue({
      data: {
        id: "ch-1",
        conversation_type: "channel",
        channel_key: "plan-tracker",
      },
      error: null,
    });
    expect(normalizeTeamChannelKey("Plan Tracker")).toBe("plan-tracker");

    const row = await createTeamChannel({
      organizationId: "org-1",
      name: "Plan Tracker",
      topic: "Q1 plan",
      memberIds: ["u-2"],
    });
    expect(row.id).toBe("ch-1");
    expect(rpc).toHaveBeenCalledWith(
      "create_team_chat_channel",
      expect.objectContaining({
        p_organization_id: "org-1",
        p_channel_key: "plan-tracker",
        p_topic: "Q1 plan",
        p_visibility: "public",
        p_member_ids: ["u-2"],
      }),
    );
  });

  it("refuses private create when team channel RPC is missing (no public downgrade)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    await expect(
      createTeamChannel({
        organizationId: "org-1",
        name: "Secrets",
        visibility: "private",
      }),
    ).rejects.toThrow(/Private channels require the team channel API/i);
  });
});
