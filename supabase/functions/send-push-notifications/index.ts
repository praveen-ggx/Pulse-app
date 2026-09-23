/**
 * send-push-notifications — processes pending rows in chat_push_outbox and
 * delivers them via the Expo Push Notifications API.
 *
 * Invoke via cron (pg_cron) or Supabase Scheduled Functions.
 * Auth: service_role key required (passed as SUPABASE_SERVICE_ROLE_KEY env var).
 *
 * Outbox row lifecycle:
 *   sent_at IS NULL  → pending
 *   sent_at IS NOT NULL → processed (regardless of delivery outcome)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
interface PushOutboxRow {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}
interface PushToken {
  token: string;
  platform: string;
}
interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  // Fetch pending outbox rows
  const { data: pendingRows, error: fetchError } = await supabase
    .from("chat_push_outbox")
    .select("*")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (fetchError) {    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const rows = (pendingRows ?? []) as PushOutboxRow[];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  // Build user_id → push tokens map
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const { data: tokenRows } = await supabase
    .from("user_push_tokens")
    .select("user_id, token, platform")
    .in("user_id", userIds);
  const tokensByUserId = new Map<string, PushToken[]>();
  for (const row of tokenRows ?? []) {
    const existing = tokensByUserId.get(row.user_id) ?? [];
    existing.push({ token: row.token, platform: row.platform });
    tokensByUserId.set(row.user_id, existing);
  }
  // Build Expo messages
  const messages: ExpoPushMessage[] = [];
  const rowIds: string[] = [];
  for (const row of rows) {
    if (!row.user_id) continue;
    const tokens = tokensByUserId.get(row.user_id) ?? [];
    for (const { token } of tokens) {
      if (!token.startsWith("ExponentPushToken[")) continue;
      messages.push({
        to: token,
        title: row.title ?? "Pulse",
        body: row.body ?? "",
        sound: "default",
        data: {
          ...(row.payload ?? {}),
          conversation_id: row.conversation_id,
          message_id: row.message_id,
        },
      });
    }
    rowIds.push(row.id);
  }
  // Send to Expo (best-effort; mark sent regardless)
  if (messages.length > 0) {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    }).catch(() => {
      // Log delivery errors — still mark rows sent to avoid retry storms
    });
  }
  // Mark all processed rows as sent
  if (rowIds.length > 0) {
    await supabase
      .from("chat_push_outbox")
      .update({ sent_at: new Date().toISOString() })
      .in("id", rowIds);
  }
  return new Response(
    JSON.stringify({ processed: rowIds.length, pushed: messages.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
