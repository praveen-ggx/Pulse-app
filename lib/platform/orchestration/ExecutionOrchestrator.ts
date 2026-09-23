import { getPlatformEventBus } from '../events/InProcessEventBus';
import type { EventBus } from '../events/EventBus.contract';
import { ExecutionPlanService } from '../services/ExecutionPlanService';
import { IndentService } from '../services/IndentService';
import { OrderService } from '../services/OrderService';
import { indentRepository } from '../repositories/indentRepository';
import type { ExecutionOrchestrator } from './ExecutionOrchestrator.contract';
import { summarizeStopsByType } from './summarizeStopLocations';
import type {
  OrchestrationError,
  PublishExecutionPlanCommand,
  PublishExecutionPlanResult,
  PublishIndentCommand,
  PublishIndentResult,
} from './types';

function fail(code: OrchestrationError['code'], message: string, correlationId: string): never {
  const err = new Error(message) as Error & OrchestrationError;
  err.code = code;
  err.correlationId = correlationId;
  throw err;
}

function requireCorrelationId(correlationId: string | undefined, fallback: string): string {
  const id = correlationId?.trim();
  if (!id) fail('INVALID_COMMAND', 'correlationId is required', fallback);
  return id;
}

async function publishDispatchEvents(
  eventBus: EventBus,
  input: {
    workspaceId: string;
    correlationId: string;
    orderId: string;
    orderNumber: string;
    indentId: string;
    requestedBy: string;
  },
): Promise<void> {
  const { workspaceId, correlationId, orderId, orderNumber, indentId, requestedBy } = input;
  const occurredAt = new Date().toISOString();

  await eventBus.publish({
    name: 'OrderReadyForDispatch',
    workspaceId,
    correlationId,
    occurredAt,
    payload: { orderId, orderNumber, requestedBy },
  });

  await eventBus.publish({
    name: 'IndentCreated',
    workspaceId,
    correlationId,
    occurredAt: new Date().toISOString(),
    payload: { orderId, indentId },
  });
}

export function createExecutionOrchestrator(eventBus: EventBus = getPlatformEventBus()): ExecutionOrchestrator {
  return {
    async publishIndent(command: PublishIndentCommand): Promise<PublishIndentResult> {
      const correlationId = requireCorrelationId(command.correlationId, 'missing-correlation-id');
      const { workspaceId, payload } = command;

      const order = await OrderService.getForPublish(workspaceId, payload.orderId);
      if (!order) {
        fail('ORDER_NOT_FOUND', 'Sales order not found', correlationId);
      }

      if (order.executionPlanId) {
        const planIndent = await IndentService.findByExecutionPlanId(workspaceId, order.executionPlanId);
        if (planIndent) {
          return { indentId: planIndent.id, orderId: order.id, correlationId };
        }
      }

      const existingIndent = await IndentService.findBySalesOrderId(workspaceId, order.id);
      if (existingIndent) {
        if (order.status !== 'Planned' && OrderService.isDispatchable(order.status)) {
          await OrderService.markPlanned(workspaceId, order.id);
        }
        return { indentId: existingIndent.id, orderId: order.id, correlationId };
      }

      if (order.status === 'Planned' || order.executionPlanId) {
        fail(
          'ORDER_NOT_DISPATCHABLE',
          'Order is already planned. Open the existing fulfillment — do not create another indent.',
          correlationId,
        );
      }

      fail(
        'INVALID_COMMAND',
        'Create an execution plan to publish this order. A lone order indent is not allowed.',
        correlationId,
      );
    },

    async publishExecutionPlan(command: PublishExecutionPlanCommand): Promise<PublishExecutionPlanResult> {
      const correlationId = requireCorrelationId(command.correlationId, 'missing-correlation-id');
      const { workspaceId, requestedBy, payload } = command;

      if (!payload.orders.length) {
        fail('INVALID_COMMAND', 'Execution plan has no orders', correlationId);
      }

      const existingPlan = await ExecutionPlanService.findByClientPlanId(workspaceId, payload.clientPlanId);
      if (existingPlan) {
        const existingIndent = await indentRepository.findByExecutionPlanId(workspaceId, existingPlan.id);
        if (existingIndent) {
          return {
            executionPlanId: existingPlan.id,
            planNumber: existingPlan.planNumber,
            indentId: existingIndent.id,
            indentCode: existingIndent.indentCode,
            correlationId,
            alreadyPublished: true,
          };
        }
      }

      const orderIds = payload.orders.map(o => o.orderId);
      const links = await OrderService.listPlanLinks(workspaceId, orderIds);
      const linkedPlanIds = [...new Set(links.map(l => l.executionPlanId).filter((id): id is string => Boolean(id)))];
      if (linkedPlanIds.length > 1) {
        fail(
          'INVALID_COMMAND',
          `Orders are already split across execution plans and cannot be republished together: ${links
            .filter(l => l.executionPlanId)
            .map(l => l.orderNumber)
            .join(', ')}`,
          correlationId,
        );
      }
      if (linkedPlanIds.length === 1) {
        const alreadyOn = links.filter(l => l.executionPlanId === linkedPlanIds[0]);
        if (alreadyOn.length !== orderIds.length) {
          fail(
            'INVALID_COMMAND',
            `Some selected orders are already on ${alreadyOn[0]?.orderNumber ?? 'another plan'}. Unplan them first or publish only pending orders.`,
            correlationId,
          );
        }
        const reused = await ExecutionPlanService.findById(workspaceId, linkedPlanIds[0]);
        const existingIndent = reused
          ? await indentRepository.findByExecutionPlanId(workspaceId, reused.id)
          : null;
        if (reused && existingIndent) {
          return {
            executionPlanId: reused.id,
            planNumber: reused.planNumber,
            indentId: existingIndent.id,
            indentCode: existingIndent.indentCode,
            correlationId,
            alreadyPublished: true,
          };
        }
        fail(
          'INVALID_COMMAND',
          'These orders are already linked to an execution plan. Publish will not create a duplicate indent.',
          correlationId,
        );
      }

      const notDispatchable = links.filter(l => !OrderService.isDispatchable(l.status));
      if (notDispatchable.length) {
        fail(
          'ORDER_NOT_DISPATCHABLE',
          `Only pending orders can be published: ${notDispatchable.map(l => l.orderNumber).join(', ')}`,
          correlationId,
        );
      }

      const supplierTarget = Number.isFinite(payload.supplierTarget)
        ? payload.supplierTarget
        : 0;

      const plan = existingPlan ?? await ExecutionPlanService.createWithGraph({
        workspaceId,
        clientPlanId: payload.clientPlanId,
        vehicleType: payload.vehicleType,
        stops: payload.stops,
        route: payload.route,
        allocations: payload.allocations,
        orders: payload.orders,
      });

      const totalAmount = payload.orders.reduce((s, o) => s + o.totalAmount, 0);
      const clientName =
        [...new Set(
          payload.orders.map((o) => o.customerName.trim()).filter(Boolean),
        )][0] ?? null;
      const indent = await IndentService.createFromExecutionPlan({
        workspaceId,
        executionPlanId: plan.id,
        planNumber: plan.planNumber,
        vehicleType: payload.vehicleType,
        orderCount: payload.orders.length,
        totalWeightKg: payload.totalWeightKg,
        totalAmount,
        supplierTarget,
        pickupSummary: summarizeStopsByType(payload.stops, 'pickup'),
        dropSummary: summarizeStopsByType(payload.stops, 'drop'),
        requestedBy,
        clientName,
      });

      await eventBus.publish({
        name: 'OrderReadyForDispatch',
        workspaceId,
        correlationId,
        occurredAt: new Date().toISOString(),
        payload: { orderIds, requestedBy },
      });

      await eventBus.publish({
        name: 'IndentCreated',
        workspaceId,
        correlationId,
        occurredAt: new Date().toISOString(),
        payload: { orderIds, indentId: indent.id, executionPlanId: plan.id },
      });

      return {
        executionPlanId: plan.id,
        planNumber: plan.planNumber,
        indentId: indent.id,
        indentCode: indent.indentCode,
        correlationId,
        alreadyPublished: false,
      };
    },

    async shareExecutionPlanToOperations(input: {
      workspaceId: string;
      executionPlanId: string;
    }): Promise<{ executionPlanId: string; alreadyShared: boolean }> {
      const plan =
        (await ExecutionPlanService.findById(input.workspaceId, input.executionPlanId))
        ?? (await ExecutionPlanService.findByClientPlanId(input.workspaceId, input.executionPlanId));
      if (!plan) {
        fail('INVALID_COMMAND', 'Execution plan not found', input.executionPlanId);
      }
      const indent = await indentRepository.findByExecutionPlanId(input.workspaceId, plan.id);
      if (!indent) {
        fail('INVALID_COMMAND', 'Convert this plan to an indent before sharing to Operations', plan.id);
      }
      if (plan.status === 'published') {
        return { executionPlanId: plan.id, alreadyShared: true };
      }
      await ExecutionPlanService.markPublished(plan.id);
      return { executionPlanId: plan.id, alreadyShared: false };
    },
  };
}

let orchestrator: ExecutionOrchestrator | null = null;

export function getExecutionOrchestrator(): ExecutionOrchestrator {
  if (!orchestrator) orchestrator = createExecutionOrchestrator();
  return orchestrator;
}

export function resetExecutionOrchestratorForTests(): void {
  orchestrator = null;
}
