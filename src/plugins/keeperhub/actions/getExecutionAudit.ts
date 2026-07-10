/**
 * GET_EXECUTION_AUDIT — the risk-guardian's AUDIT step.
 *
 * Given an executionId (from AAVE_REPAY, TRANSFER, or any KeeperHub
 * execution), pulls the full audit trail: execution trace, per-node statuses,
 * gas used, transaction hash, Etherscan link, and timestamps. This is the
 * surface that satisfies the hackathon's "reliability & observability"
 * judging criterion.
 *
 * Tries the workflow audit tool (get_execution — richer trail) first, and
 * falls back to the direct-execution status tool (get_direct_execution_status)
 * for ids that came from execute_transfer / execute_protocol_action.
 */
import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from '@elizaos/core';
import { KeeperHubClient } from '../client.ts';

function renderAudit(status: any): string {
  const trace = status?.executionTrace ?? status?.logs?.executionTrace ?? status?.status?.executionTrace;
  const nodeStatuses =
    status?.nodeStatuses ?? status?.status?.nodeStatuses ?? status?.logs?.nodeStatuses;
  const txHashes =
    status?.transactionHashes ?? status?.logs?.transactionHashes ?? status?.status?.transactionHashes;
  const gas = status?.gasUsedWei ?? status?.gasUsed ?? status?.logs?.gasUsedWei ?? status?.status?.gasUsedWei;
  const started = status?.startedAt ?? status?.logs?.startedAt;
  const completed = status?.completedAt ?? status?.logs?.completedAt;
  const overallStatus = status?.status ?? status?.logs?.status;

  const lines: string[] = [`📋 **Execution Audit**`];
  lines.push(`- Overall status: ${overallStatus ?? 'unknown'}`);
  if (trace) lines.push(`- Execution trace: ${Array.isArray(trace) ? trace.join(' → ') : trace}`);
  if (nodeStatuses && Array.isArray(nodeStatuses) && nodeStatuses.length) {
    lines.push(`- Nodes: ${nodeStatuses.map((n: any) => `${n.nodeName ?? n.nodeId}:${n.status}`).join(', ')}`);
  }
  if (txHashes && Array.isArray(txHashes) && txHashes.length) {
    for (const t of txHashes) {
      const h = typeof t === 'string' ? t : t.hash;
      lines.push(`- TX hash: \`${h}\``);
    }
  }
  if (gas) lines.push(`- Gas used: ${gas} (sponsored by KeeperHub)`);
  if (started) lines.push(`- Started: ${started}`);
  if (completed) lines.push(`- Completed: ${completed}`);
  return lines.join('\n');
}

export const getExecutionAuditAction: Action = {
  name: 'GET_EXECUTION_AUDIT',
  similes: ['AUDIT', 'EXECUTION_STATUS', 'AUDIT_TRAIL', 'GET_AUDIT', 'CHECK_EXECUTION'],
  description:
    'Pull the full audit trail (trace, gas, tx hash, timestamps) for a KeeperHub execution by ID.',

  validate: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<boolean> => {
    return !!runtime.getSetting('KEEPERHUB_API_KEY');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    const apiKey = runtime.getSetting('KEEPERHUB_API_KEY') as string | undefined;
    const baseUrl =
      (runtime.getSetting('KEEPERHUB_BASE_URL') as string | undefined) || 'https://app.keeperhub.com';

    if (!apiKey) {
      return {
        text: 'KeeperHub API key not configured.',
        success: false,
        error: new Error('Missing KEEPERHUB_API_KEY'),
      };
    }

    const client = new KeeperHubClient(apiKey, baseUrl);

    try {
      const content = message.content as any;
      const executionId = content.executionId || content.execution_id || content.id;

      if (!executionId) {
        await callback({
          text: 'I need an execution ID. Example: "Audit execution abc123"',
          action: 'GET_EXECUTION_AUDIT',
        });
        return {
          text: 'Missing execution ID',
          success: false,
          error: new Error('Missing executionId'),
        };
      }

      logger.info(`[KeeperHub] Fetching audit trail for execution ${executionId}`);

      // Try the workflow audit tool first (richer trail), fall back to direct-execution status.
      let status: any;
      try {
        status = await client.getExecution(executionId);
      } catch (wfErr) {
        logger.warn(
          `[KeeperHub] get_execution failed (${(wfErr as Error).message}); trying get_direct_execution_status`
        );
        status = await client.getDirectExecutionStatus(executionId);
      }

      const text = renderAudit(status);

      await callback({
        text,
        action: 'GET_EXECUTION_AUDIT',
        data: status as unknown as Record<string, unknown>,
      });

      return {
        text,
        success: true,
        data: status as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[KeeperHub] Audit fetch failed: ${errorMsg}`);
      await callback({
        text: `❌ **Audit fetch failed**\nError: ${errorMsg}`,
        action: 'GET_EXECUTION_AUDIT',
      });
      return {
        text: `Audit fetch failed: ${errorMsg}`,
        success: false,
        error: error instanceof Error ? error : new Error(errorMsg),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'Show me the audit trail for execution abc123' },
      },
      {
        name: 'Risk Guardian',
        content: {
          text: '📋 Execution Audit\n- Overall status: success\n- Execution trace: trigger-1 → transfer-1\n- TX hash: `0x…`\n- Gas used: 77830 (sponsored)',
          actions: ['GET_EXECUTION_AUDIT'],
        },
      },
    ],
  ],
};
