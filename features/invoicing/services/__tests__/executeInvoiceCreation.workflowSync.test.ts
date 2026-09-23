import { readFileSync } from 'fs';
import { join } from 'path';
import { executeInvoiceCreation } from '../invoicing.service';
import { invoiceIssueRequirePod } from '../../utils/invoicePodRequired.util';
import {
  INVOICE_POD_HARD_COPY_REQUIRED,
  INVOICE_POD_MULTI_CLIENT,
  INVOICE_POD_OPTIONS_CONFLICT,
  INVOICE_POD_POLICY_UNCONFIGURED,
  INVOICE_POD_SOFT_COPY_REQUIRED,
} from '../../utils/invoicePodEnforcement.util';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockRecordTripWorkflowEvent = jest.fn().mockResolvedValue({ error: null, event: { id: 'evt-1' }, alreadyExists: false });

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

jest.mock('@/features/trips/services/tripWorkflow.service', () => ({
  recordTripWorkflowEvent: (...args: unknown[]) => mockRecordTripWorkflowEvent(...args),
}));

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRIP_1 = '11111111-1111-4111-8111-111111111111';
const TRIP_2 = '22222222-2222-4222-8222-222222222222';
const ALLOCATED = 'INV/2026-27/00001';

const CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLIENT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const candidateTrips = [
  {
    id: TRIP_1,
    organization_id: ORG,
    trip_number: 'T-001',
    display_trip_id: 'T-001',
    client_id: CLIENT,
    client_name: 'Acme',
    client_price: 1000,
    status: 'completed',
  },
  {
    id: TRIP_2,
    organization_id: ORG,
    trip_number: 'T-002',
    display_trip_id: 'T-002',
    client_id: CLIENT,
    client_name: 'Acme',
    client_price: 500,
    status: 'completed',
  },
];

function thenable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = jest.fn(self);
  builder.in = jest.fn(self);
  builder.eq = jest.fn(self);
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.insert = jest.fn(self);
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordTripWorkflowEvent.mockResolvedValue({ error: null, event: { id: 'evt-1' }, alreadyExists: false });
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'issue_customer_invoice') return Promise.resolve({ data: ALLOCATED, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

function mockHappyPath(opts?: {
  trips?: typeof candidateTrips;
  podTripIds?: string[];
  existingTripIds?: string[][];
  insertError?: unknown;
  issueError?: unknown;
  clientPolicy?: unknown;
  clientMissing?: boolean;
}) {
  const trips = opts?.trips ?? candidateTrips;
  const podTripIds = opts?.podTripIds ?? trips.map((t) => t.id);
  const existing = (opts?.existingTripIds ?? []).map((trip_ids) => ({
    trip_ids,
    status: "sent",
  }));
  const mockInsert = jest.fn(() =>
    Promise.resolve({ data: null, error: opts?.insertError ?? null }),
  );

  mockFrom.mockImplementation((table: string) => {
    if (table === 'trips') {
      return thenable({ data: trips, error: null });
    }
    if (table === 'trip_documents') {
      return thenable({
        data: podTripIds.map((trip_id) => ({ trip_id })),
        error: null,
      });
    }
    if (table === 'clients') {
      if (opts?.clientMissing) {
        return thenable({ data: null, error: null });
      }
      return thenable({
        data: {
          id: CLIENT,
          invoice_pod_policy:
            opts && "clientPolicy" in opts ? opts.clientPolicy : "none",
        },
        error: null,
      });
    }
    if (table === 'invoices') {
      const builder = thenable({ data: existing, error: null });
      builder.insert = mockInsert;
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { mockInsert };
}

describe('executeInvoiceCreation — live invoices architecture', () => {
  it('inserts one public.invoices row and records invoice.generated per trip', async () => {
    const { mockInsert } = mockHappyPath();

    const { error, invoiceNumber } = await executeInvoiceCreation([TRIP_1, TRIP_2], {
      includeGst: true,
      gstRate: 18,
      includeFuel: false,
      fuelRate: 0,
      additionalCharges: [],
      notes: 'ok',
      paymentTerms: 'Net 30',
    });
    expect(error).toBeNull();
    expect(invoiceNumber).toBe(ALLOCATED);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      'issue_customer_invoice',
      expect.objectContaining({
        p_org_id: ORG,
        p_client_id: CLIENT,
        p_trip_ids: [TRIP_1, TRIP_2],
        p_igst_amount: 0,
      }),
    );
    expect(mockInsert).not.toHaveBeenCalled();

    await flushPromises();
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledWith({
      tripId: TRIP_1,
      orgId: ORG,
      eventType: 'invoice.generated',
      payload: { invoice_no: ALLOCATED },
    });
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledWith({
      tripId: TRIP_2,
      orgId: ORG,
      eventType: 'invoice.generated',
      payload: { invoice_no: ALLOCATED },
    });
  });

  it('forwards draft id and idempotency key into the issue RPC', async () => {
    mockHappyPath();
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2], {
      draftId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      idempotencyKey: 'issue-key-1',
    });
    expect(error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith(
      'issue_customer_invoice',
      expect.objectContaining({
        p_draft_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        p_idempotency_key: 'issue-key-1',
      }),
    );
  });

  it('retries with the same idempotency key do not insert locally', async () => {
    mockHappyPath();
    const first = await executeInvoiceCreation([TRIP_1, TRIP_2], {
      idempotencyKey: 'retry-key',
    });
    const second = await executeInvoiceCreation([TRIP_1, TRIP_2], {
      idempotencyKey: 'retry-key',
    });
    expect(first.invoiceNumber).toBe(ALLOCATED);
    expect(second.invoiceNumber).toBe(ALLOCATED);
    expect(
      mockRpc.mock.calls.every((call) => call[0] === 'issue_customer_invoice'),
    ).toBe(true);
    expect(
      mockRpc.mock.calls.every(
        (call) =>
          (call[1] as { p_idempotency_key?: string }).p_idempotency_key ===
          'retry-key',
      ),
    ).toBe(true);
  });

  it('A: requirePod=true + digital POD present succeeds', async () => {
    mockHappyPath({ podTripIds: [TRIP_1, TRIP_2] });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2], undefined, {
      requirePod: true,
    });
    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).toHaveBeenCalledWith(
      'issue_customer_invoice',
      expect.objectContaining({ p_org_id: ORG, p_client_id: CLIENT }),
    );
  });

  it('B: requirePod=true + digital POD absent throws and does not allocate', async () => {
    mockHappyPath({ podTripIds: [TRIP_1] });

    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2], undefined, {
      requirePod: true,
    });
    expect(error?.message).toBe('POD is required before invoice creation.');
    expect(mockFrom).toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('C: requirePod=false + digital POD present skips lookup and succeeds', async () => {
    mockHappyPath({ podTripIds: [TRIP_1, TRIP_2] });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2], undefined, {
      requirePod: false,
    });
    expect(error).toBeNull();
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).toHaveBeenCalledWith(
      'issue_customer_invoice',
      expect.objectContaining({ p_org_id: ORG, p_client_id: CLIENT }),
    );
  });

  it('D: requirePod=false + digital POD absent proceeds past POD gate', async () => {
    mockHappyPath({ podTripIds: [] });
    const { error, invoiceNumber } = await executeInvoiceCreation(
      [TRIP_1, TRIP_2],
      undefined,
      { requirePod: false },
    );
    expect(error).toBeNull();
    expect(invoiceNumber).toBe(ALLOCATED);
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('E: omitted requirePod uses client policy none, not a workspace/device fallback', async () => {
    mockHappyPath({ podTripIds: [], clientPolicy: 'none' });
    const omitted = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(omitted.error).toBeNull();
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).toHaveBeenCalledWith(
      'issue_customer_invoice',
      expect.objectContaining({ p_org_id: ORG }),
    );

    jest.clearAllMocks();
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'issue_customer_invoice') return Promise.resolve({ data: ALLOCATED, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    mockHappyPath({ podTripIds: [] });
    const explicit = await executeInvoiceCreation([TRIP_1, TRIP_2], undefined, {
      requirePod: true,
    });
    expect(explicit.error?.message).toBe('POD is required before invoice creation.');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('NULL client POD policy blocks issuance without calling the issue RPC', async () => {
    mockHappyPath({ clientPolicy: null });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe(INVOICE_POD_POLICY_UNCONFIGURED);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('Pulse Invoice POD OFF maps invoiceIssueRequirePod(false) into executeInvoiceCreation', async () => {
    mockHappyPath({ podTripIds: [] });
    const requirePod = invoiceIssueRequirePod(false);
    expect(requirePod).toBe(false);
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2], undefined, {
      requirePod,
    });
    expect(error).toBeNull();
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).toHaveBeenCalled();
  });

  it('regression: POD ON still rejects missing digital POD before allocate (hard POD is not a persist substitute)', async () => {
    mockHappyPath({ podTripIds: [] });
    const requirePod = invoiceIssueRequirePod(true);
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2], undefined, {
      requirePod,
    });
    expect(error?.message).toBe('POD is required before invoice creation.');
    expect(mockFrom).toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not allocate or insert when a selected trip is missing digital POD (legacy requirePod)', async () => {
    mockHappyPath({ podTripIds: [TRIP_1] });

    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2], undefined, {
      requirePod: true,
    });
    expect(error?.message).toBe('POD is required before invoice creation.');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('does not allocate or insert when a selected trip is already invoiced', async () => {
    mockHappyPath({ existingTripIds: [[TRIP_2]] });

    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe('One or more selected trips have already been invoiced.');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('fails when selected trips span multiple organizations', async () => {
    mockHappyPath({
      trips: [
        { ...candidateTrips[0] },
        { ...candidateTrips[1], organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      ],
    });

    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe('Selected trips must belong to the same workspace.');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('does not write workflow events when invoice issuance RPC fails', async () => {
    mockHappyPath();
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'issue_customer_invoice') {
        return Promise.resolve({ data: null, error: { message: 'insert failed' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error).not.toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });
});

function tripsForClient(clientId: string, physicalAt: string | null) {
  return candidateTrips.map((trip) => ({
    ...trip,
    client_id: clientId,
    pod_received_at: physicalAt,
  }));
}

describe('P2.2 authoritative Issue revalidation', () => {
  it('24-26. failed HARD_COPY gate does not allocate, insert, or write workflow', async () => {
    const { mockInsert } = mockHappyPath({
      trips: tripsForClient(CLIENT, null),
      podTripIds: [TRIP_1, TRIP_2],
      clientPolicy: 'hard_copy',
    });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe(INVOICE_POD_HARD_COPY_REQUIRED);
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('27-28. successful HARD_COPY gate allocates and inserts', async () => {
    const { mockInsert } = mockHappyPath({
      trips: tripsForClient(CLIENT, '2026-09-11T12:00:00.000Z'),
      podTripIds: [],
      clientPolicy: 'hard_copy',
    });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error).toBeNull();
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).toHaveBeenCalledWith(
      'issue_customer_invoice',
      expect.objectContaining({ p_org_id: ORG, p_client_id: CLIENT }),
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('29. NONE performs no digital POD lookup', async () => {
    mockHappyPath({
      trips: tripsForClient(CLIENT, null),
      podTripIds: [],
      clientPolicy: 'none',
    });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error).toBeNull();
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
  });

  it('30. HARD_COPY performs no digital POD lookup', async () => {
    mockHappyPath({
      trips: tripsForClient(CLIENT, '2026-09-11T12:00:00.000Z'),
      clientPolicy: 'hard_copy',
    });
    await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
  });

  it('31. SOFT_COPY uses batched digital POD lookup', async () => {
    mockHappyPath({
      trips: tripsForClient(CLIENT, null),
      podTripIds: [TRIP_1, TRIP_2],
      clientPolicy: 'soft_copy',
    });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('trip_documents');
  });

  it('SOFT_COPY + physical POD only is rejected before allocator', async () => {
    mockHappyPath({
      trips: tripsForClient(CLIENT, '2026-09-11T12:00:00.000Z'),
      podTripIds: [],
      clientPolicy: 'soft_copy',
    });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe(INVOICE_POD_SOFT_COPY_REQUIRED);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('stale UI SOFT_COPY vs authoritative HARD_COPY rejects digital-only evidence', async () => {
    mockHappyPath({
      trips: tripsForClient(CLIENT, null),
      podTripIds: [TRIP_1, TRIP_2],
      clientPolicy: 'hard_copy',
    });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe(INVOICE_POD_HARD_COPY_REQUIRED);
    expect(mockFrom).not.toHaveBeenCalledWith('trip_documents');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('stale UI NONE vs authoritative HARD_COPY rejects missing physical POD', async () => {
    mockHappyPath({
      trips: tripsForClient(CLIENT, null),
      clientPolicy: 'hard_copy',
    });
    const authoritative = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(authoritative.error?.message).toBe(INVOICE_POD_HARD_COPY_REQUIRED);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('multiple client_ids block before allocator', async () => {
    mockHappyPath({
      trips: [
        { ...candidateTrips[0], client_id: CLIENT, pod_received_at: null },
        { ...candidateTrips[1], client_id: CLIENT_B, pod_received_at: null },
      ],
      clientPolicy: 'none',
    });
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe(INVOICE_POD_MULTI_CLIENT);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('conflicting podPolicy + requirePod is rejected', async () => {
    mockHappyPath();
    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2], undefined, {
      requirePod: true,
      podPolicy: 'hard_copy',
    });
    expect(error?.message).toBe(INVOICE_POD_OPTIONS_CONFLICT);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('requirePod plumbing contract', () => {
  const serviceSrc = readFileSync(join(__dirname, '../invoicing.service.ts'), 'utf8');
  const queriesSrc = readFileSync(
    join(__dirname, '../../../../lib/queries/useInvoicingExecuteQueries.ts'),
    'utf8',
  );
  const screenSrc = readFileSync(
    join(__dirname, '../../InvoicingExecuteScreen.tsx'),
    'utf8',
  );

  it('does not use AsyncStorage or workspace POD Required for eligibility', () => {
    expect(serviceSrc).not.toMatch(/AsyncStorage/);
    expect(serviceSrc).not.toMatch(/loadWorkspaceInvoicePodRequired/);
    expect(serviceSrc).toMatch(/enforceInvoicePodGate/);
    expect(serviceSrc).toMatch(/issue_customer_invoice/);
  });

  it('mutation omits requirePod so Issue revalidates authoritatively', () => {
    expect(queriesSrc).toMatch(
      /requirePod === undefined \? undefined : \{ requirePod \}/,
    );
  });

  it('Pulse Invoice Issue does not pass invoiceIssueRequirePod into the mutation', () => {
    expect(screenSrc).toMatch(/restoreInvoiceDraftTripIds/);
    expect(screenSrc).toMatch(/issueMutation\.mutate\(/);
    expect(screenSrc).not.toMatch(/invoiceIssueRequirePod\(podRequired\)/);
    expect(screenSrc).not.toMatch(
      /allTrips\.filter\(\(t\) => t\.status === "approved"\)\.map\(\(t\) => t\.id\)/,
    );
  });
});
