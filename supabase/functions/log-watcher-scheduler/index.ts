// Log Watcher Scheduler
// Runs on pg_cron schedule (every 60 seconds by default)
// Polls console logs, detects incidents, triggers AI investigations for CRITICAL/HIGH
// Read-only access to logs, read-write to incident tables only

import { createClient } from 'npm:@supabase/supabase-js@2';

const WATCHER_NAME = 'log-watcher-scheduler';
const INVESTIGATION_COOLDOWN_MS = 300000; // 5 minutes between investigations per incident
const MAX_EVENTS_PER_RUN = 100;
const MAX_LOG_LINES = 5000;

interface SupabaseConfig {
  url: string;
  serviceKey: string;
}

interface WatcherCheckpoint {
  watcher_name: string;
  last_processed_id: number | null;
  last_processed_at: string;
  last_successful_run: string;
  events_processed: number;
  incidents_created: number;
  investigations_started: number;
  failures_total: number;
  updated_at: string;
}

interface IncidentForInvestigation {
  id: string;
  fingerprint: string;
  service: string;
  title: string;
  severity: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
  investigation_status: string;
}

function getSupabaseConfig(): SupabaseConfig {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return { url, serviceKey };
}

async function createSupabaseClient(config: SupabaseConfig) {
  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false },
  });
}

async function getCheckpoint(
  supabase: ReturnType<typeof createClient>,
  name: string
): Promise<WatcherCheckpoint | null> {
  const { data, error } = await supabase
    .from('ops.watcher_checkpoint')
    .select('*')
    .eq('watcher_name', name)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[log-watcher] checkpoint read error:', error.message);
    return null;
  }

  return data as WatcherCheckpoint | null;
}

async function updateCheckpoint(
  supabase: ReturnType<typeof createClient>,
  name: string,
  updates: Partial<WatcherCheckpoint>
): Promise<boolean> {
  const { error } = await supabase
    .from('ops.watcher_checkpoint')
    .upsert(
      {
        watcher_name: name,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'watcher_name' }
    );

  if (error) {
    console.error('[log-watcher] checkpoint update error:', error.message);
    return false;
  }

  return true;
}

// Fetch incidents that should be investigated
async function getIncidentsForInvestigation(
  supabase: ReturnType<typeof createClient>
): Promise<IncidentForInvestigation[]> {
  const { data, error } = await supabase
    .from('ops.incidents')
    .select('id, fingerprint, service, title, severity, event_count, first_seen, last_seen, investigation_status')
    .in('severity', ['CRITICAL', 'HIGH'])
    .in('status', ['OPEN', 'INVESTIGATING'])
    .eq('investigation_status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('[log-watcher] incident fetch error:', error.message);
    return [];
  }

  return (data || []) as IncidentForInvestigation[];
}

// Mark an incident as investigation in progress
async function markInvestigationStarted(
  supabase: ReturnType<typeof createClient>,
  incidentId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('ops.incidents')
    .update({ investigation_status: 'IN_PROGRESS' })
    .eq('id', incidentId);

  if (error) {
    console.error('[log-watcher] mark investigation error:', error.message);
    return false;
  }

  return true;
}

// Create investigation record (AI agent will populate it later)
async function createInvestigation(
  supabase: ReturnType<typeof createClient>,
  incidentId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ops.investigations')
    .insert({
      incident_id: incidentId,
      status: 'PENDING',
      model: 'claude-opus-5',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[log-watcher] investigation create error:', error.message);
    return null;
  }

  return (data as { id: string }).id;
}

// Trigger the AI investigation agent via HTTP call to the investigate function
async function triggerInvestigationAgent(investigationId: string, _incidentId: string): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[log-watcher] Missing Supabase config for investigation trigger');
      return false;
    }

    // Call the investigation function via HTTP
    const response = await fetch(
      `${supabaseUrl}/functions/v1/log-watcher-investigate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ investigationId }),
      }
    );

    if (!response.ok) {
      console.error(
        `[log-watcher] Investigation trigger failed: ${response.status} ${await response.text()}`
      );
      return false;
    }

    console.log(`[log-watcher] Investigation triggered: ${investigationId}`);
    return true;
  } catch (err) {
    console.error(
      '[log-watcher] Investigation trigger error:',
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

async function run(): Promise<void> {
  try {
    const config = getSupabaseConfig();
    const supabase = await createSupabaseClient(config);

    // Get or create checkpoint
    let checkpoint = await getCheckpoint(supabase, WATCHER_NAME);
    if (!checkpoint) {
      checkpoint = {
        watcher_name: WATCHER_NAME,
        last_processed_id: null,
        last_processed_at: new Date().toISOString(),
        last_successful_run: new Date().toISOString(),
        events_processed: 0,
        incidents_created: 0,
        investigations_started: 0,
        failures_total: 0,
        updated_at: new Date().toISOString(),
      };
    }

    // Cleanup old data
    await supabase.rpc('trim_log_events');
    await supabase.rpc('trim_incidents');

    // Auto-resolve stale incidents (no activity > 6 hours)
    const resolveResult = await supabase.rpc('auto_resolve_stale_incidents', { p_hours: 6 });
    console.log(`[log-watcher] auto-resolved stale incidents:`, resolveResult);

    // Find incidents ready for AI investigation
    const incidentsToInvestigate = await getIncidentsForInvestigation(supabase);
    console.log(`[log-watcher] found ${incidentsToInvestigate.length} incidents for investigation`);

    let investigationsStarted = 0;

    for (const incident of incidentsToInvestigate) {
      // Check if incident meets investigation criteria
      if (incident.severity === 'CRITICAL' || (incident.severity === 'HIGH' && incident.event_count > 10)) {
        const marked = await markInvestigationStarted(supabase, incident.id);
        if (marked) {
          const invId = await createInvestigation(supabase, incident.id);
          if (invId) {
            const triggered = await triggerInvestigationAgent(invId, incident.id);
            if (triggered) {
              investigationsStarted++;
            }
          }
        }
      }
    }

    // Update checkpoint
    await updateCheckpoint(supabase, WATCHER_NAME, {
      last_successful_run: new Date().toISOString(),
      investigations_started: checkpoint.investigations_started + investigationsStarted,
      updated_at: new Date().toISOString(),
    });

    console.log(`[log-watcher] run complete - investigations started: ${investigationsStarted}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[log-watcher] fatal error:', message);

    // Record failure in checkpoint
    const config = getSupabaseConfig();
    const supabase = await createSupabaseClient(config);
    const checkpoint = await getCheckpoint(supabase, WATCHER_NAME);
    if (checkpoint) {
      await updateCheckpoint(supabase, WATCHER_NAME, {
        failures_total: checkpoint.failures_total + 1,
      });
    }
  }
}

// Deno.serve entry point (for manual HTTP trigger during development)
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  try {
    await run();
    return new Response(
      JSON.stringify({ message: 'Log watcher run complete' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
