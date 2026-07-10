/**
 * KeeperHub MCP Client
 *
 * Talks to KeeperHub's MCP server (JSON-RPC 2.0 over HTTP) to execute real
 * on-chain transactions through KeeperHub — the required execution layer for
 * the Agents Onchain Hackathon.
 *
 * ## Why MCP, not REST
 * KeeperHub exposes on-chain execution as MCP tools, not REST endpoints.
 * The earlier draft of this client POSTed to `/api/execute/transfer`-style
 * REST paths — those do not exist on the live server (verified 2026-07-10).
 * The equivalent capabilities live behind the MCP server at `POST /mcp`:
 *
 *   - execute_transfer             → native / ERC-20 transfer from the org wallet
 *   - execute_contract_call        → call any smart contract (view returns result, write submits)
 *   - execute_check_and_execute    → read → condition → conditional write
 *   - get_direct_execution_status  → status of a direct execution (tx hash, explorer link)
 *   - create_workflow / execute_workflow / get_execution  → visual-workflow mode
 *   - search_protocol_actions / execute_protocol_action   → DeFi protocol actions (Aave, …)
 *
 * ## Auth
 * `Authorization: Bearer <kh_ org API key>`. Create one at
 * https://app.keeperhub.com → Settings → API Keys → Organisation tab.
 *
 * ## Session
 * The MCP Streamable HTTP transport issues a session id in the
 * `Mcp-Session-Id` response header on `initialize`. We hold it and replay it
 * on every subsequent `tools/call`; we lazily (re)initialize on first use and
 * on session-expired errors.
 *
 * ## Gas
 * On-chain writes are gas-sponsored by KeeperHub (`sponsored: true` in the
 * execution output). The org wallet does not need to be pre-funded with
 * Sepolia ETH for testnet runs.
 *
 * @see https://docs.keeperhub.com/ai-tools/mcp-server
 */

import { logger } from '@elizaos/core';

const DEFAULT_BASE_URL = 'https://app.keeperhub.com';
const MCP_PATH = '/mcp';
const PROTOCOL_VERSION = '2025-06-18';

// --- Chain IDs (KeeperHub accepts chain IDs as strings) ---
export const CHAIN = {
  ETHEREUM: '1',
  SEPOLIA: '11155111',
  BASE: '8453',
  ARBITRUM: '42161',
  POLYGON: '137',
} as const;

// ---------------------------------------------------------------------------
// Param / result types
// ---------------------------------------------------------------------------

export interface TransferParams {
  network: string; // chain ID, e.g. CHAIN.SEPOLIA
  recipientAddress: string; // 0x…
  amount: string; // human-readable, e.g. "0.001"
  /** ERC-20 token address; omit for native token transfer. */
  tokenAddress?: string;
  gasLimitMultiplier?: string;
  /** When true, simulate only — do not broadcast. */
  simulate?: boolean;
}

export interface ContractCallParams {
  network: string;
  contractAddress: string;
  functionName: string; // ABI function name or full signature for overloads
  functionArgs?: string; // JSON array string, e.g. '["0x...", "1000"]'
  abi?: string; // JSON ABI string; auto-fetched for verified contracts if omitted
  value?: string; // native value in ether (payable functions)
  gasLimitMultiplier?: string;
  simulate?: boolean;
}

export interface CheckAndExecuteParams {
  network: string;
  contractAddress: string;
  functionName: string;
  functionArgs?: string;
  abi?: string;
  condition: { operator: string; value: string };
  action: {
    contractAddress: string;
    functionName: string;
    functionArgs?: string;
    abi?: string;
    gasLimitMultiplier?: string;
  };
  simulate?: boolean;
}

/** Normalized execution result surfaced to actions / agent. */
export interface ExecutionResult {
  executionId?: string;
  status: 'completed' | 'failed' | 'pending' | 'running' | 'simulated' | string;
  transactionHash?: string;
  transactionLink?: string;
  gasUsedWei?: string;
  gasSponsored?: boolean;
  result?: unknown;
  error?: string;
  // simulation-only fields
  from?: string;
  to?: string;
  value?: string;
  gasEstimate?: string;
  simulatedReturnValue?: unknown;
  wouldRevert?: boolean;
  revertReason?: string;
}

export interface ExecutionStatus {
  executionId: string;
  status: string;
  transactionHash?: string;
  transactionLink?: string;
  gasUsedWei?: string;
  gasSponsored?: boolean;
  result?: unknown;
  error?: string | null;
  startedAt?: string;
  completedAt?: string;
  executionTrace?: string[];
}

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'forEach' | string;
  data: {
    label: string;
    type: string;
    config: Record<string, unknown>;
    status?: string;
    description?: string;
  };
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface CreateWorkflowParams {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ---------------------------------------------------------------------------
// MCP transport
// ---------------------------------------------------------------------------

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/** Parsed content of a tools/call result.
 *
 * `rpc()` already unwraps the JSON-RPC envelope, so `raw` here IS the
 * `result` object — for tools/call that's `{ content: [{type, text}], isError? }`.
 * (Do not re-index through `.result` — that's the envelope we already stripped.)
 */
function extractToolContent(raw: unknown): unknown {
  const r = raw as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  if (r.isError) {
    const t = r.content?.find((c) => c.type === 'text')?.text ?? JSON.stringify(r);
    throw new Error(`MCP tool error: ${t}`);
  }
  const text = r.content?.find((c) => c.type === 'text')?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text; // non-JSON text payload
  }
}

export class KeeperHubClient {
  private apiKey: string;
  private baseUrl: string;
  private mcpUrl: string;
  private sessionId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private rpcId = 1;

  constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL) {
    if (!apiKey) {
      throw new Error('KeeperHubClient requires a kh_ API key');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.mcpUrl = `${this.baseUrl}${MCP_PATH}`;
  }

  // --- low-level JSON-RPC ---

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    return h;
  }

  private async rpc<T>(method: string, params: unknown): Promise<T> {
    const id = this.rpcId++;
    const res = await fetch(this.mcpUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });

    // Capture the session id issued by the server on initialize.
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`KeeperHub MCP HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as JsonRpcResponse<T>;
    if (data.error) {
      const msg = `MCP ${method} error ${data.error.code}: ${data.error.message}`;
      // Session-expired → force re-init on next call.
      if (/session|expired|unauthorized|401/i.test(msg)) this.sessionId = null;
      throw new Error(msg);
    }
    return data.result as T;
  }

  /** Lazily initialize (or re-initialize) the MCP session. Idempotent in flight. */
  private async ensureSession(): Promise<void> {
    if (this.sessionId) return;
    if (!this.initPromise) {
      this.initPromise = this.doInit().finally(() => {
        this.initPromise = null;
      });
    }
    await this.initPromise;
  }

  private async doInit(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'elizaos-keeperhub-plugin', version: '0.1.0' },
    });
    // notifications/initialized has no id and yields no response.
    await fetch(this.mcpUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }).catch(() => {
      /* notification best-effort */
    });
    logger.info(`[KeeperHub] MCP session ready @ ${this.mcpUrl}`);
  }

  /** Call an MCP tool by name with structured arguments. */
  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.ensureSession();
    try {
      const result = await this.rpc('tools/call', { name, arguments: args });
      return extractToolContent(result) as T;
    } catch (err) {
      // One retry after a fresh session, in case the session went stale.
      if (this.sessionId) {
        logger.warn(`[KeeperHub] tool ${name} failed (${(err as Error).message}); retrying with fresh session`);
        this.sessionId = null;
        await this.ensureSession();
        const result = await this.rpc('tools/call', { name, arguments: args });
        return extractToolContent(result) as T;
      }
      throw err;
    }
  }

  // --- Direct execution (no workflow needed) ---

  /**
   * Transfer native tokens or ERC-20s from the org wallet via the
   * `execute_transfer` MCP tool. Gas is sponsored by KeeperHub.
   */
  async transfer(params: TransferParams): Promise<ExecutionResult> {
    return this.callTool<ExecutionResult>('execute_transfer', {
      network: params.network,
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      ...(params.tokenAddress ? { tokenAddress: params.tokenAddress } : {}),
      ...(params.gasLimitMultiplier ? { gasLimitMultiplier: params.gasLimitMultiplier } : {}),
      ...(params.simulate !== undefined ? { simulate: params.simulate } : {}),
    });
  }

  /** Call any smart contract function via `execute_contract_call`. */
  async contractCall(params: ContractCallParams): Promise<ExecutionResult> {
    return this.callTool<ExecutionResult>('execute_contract_call', {
      network: params.network,
      contractAddress: params.contractAddress,
      abiFunction: params.functionName,
      ...(params.functionArgs ? { functionArgs: params.functionArgs } : {}),
      ...(params.abi ? { abi: params.abi } : {}),
      ...(params.value ? { ethValue: params.value } : {}),
      ...(params.gasLimitMultiplier ? { gasLimitMultiplier: params.gasLimitMultiplier } : {}),
      ...(params.simulate !== undefined ? { simulate: params.simulate } : {}),
    });
  }

  /** Read → condition → conditional write via `execute_check_and_execute`. */
  async checkAndExecute(params: CheckAndExecuteParams): Promise<ExecutionResult> {
    return this.callTool<ExecutionResult>('execute_check_and_execute', {
      network: params.network,
      contractAddress: params.contractAddress,
      abiFunction: params.functionName,
      ...(params.functionArgs ? { functionArgs: params.functionArgs } : {}),
      ...(params.abi ? { abi: params.abi } : {}),
      condition: params.condition,
      action: params.action,
      ...(params.simulate !== undefined ? { simulate: params.simulate } : {}),
    });
  }

  /** Status of a direct execution (transfer / contract call). */
  async getExecutionStatus(executionId: string): Promise<ExecutionStatus> {
    return this.callTool<ExecutionStatus>('get_direct_execution_status', { executionId });
  }

  // --- Workflow mode (build + trigger visual workflows) ---

  async createWorkflow(params: CreateWorkflowParams): Promise<{ id: string; name: string }> {
    return this.callTool('create_workflow', {
      name: params.name,
      ...(params.description ? { description: params.description } : {}),
      nodes: params.nodes,
      edges: params.edges,
    });
  }

  /** Trigger a manual execution of a workflow; returns executionId. */
  async executeWorkflow(workflowId: string, input: Record<string, unknown> = {}): Promise<{ executionId: string; status: string }> {
    return this.callTool('execute_workflow', { id: workflowId, ...(Object.keys(input).length ? { input } : {}) });
  }

  /**
   * Get combined status + step-by-step logs for a workflow execution.
   * This is the audit-trail surface (executionTrace, nodeStatuses, gasUsed,
   * transactionHashes, started/completedAt) — directly satisfies the
   * "reliability & observability" judging criterion.
   */
  async getExecution(executionId: string): Promise<ExecutionStatus & { logs?: unknown }> {
    return this.callTool('get_execution', { executionId });
  }

  // --- DeFi protocol actions (the write side for the risk-guardian agent) ---

  /** Discover available DeFi protocol actions (Aave, etc.) for a network. */
  async searchProtocolActions(query: { protocol?: string; network?: string; actionType?: string } = {}): Promise<unknown> {
    return this.callTool('search_protocol_actions', query as Record<string, unknown>);
  }

  /** Execute a discovered DeFi protocol action (e.g. Aave repay / supply). */
  async executeProtocolAction(params: Record<string, unknown>): Promise<ExecutionResult> {
    return this.callTool<ExecutionResult>('execute_protocol_action', params);
  }

  // --- Integrations / wallet ---

  async listIntegrations(): Promise<unknown> {
    return this.callTool('list_integrations', {});
  }

  async getWalletIntegration(integrationId?: string): Promise<unknown> {
    const args = integrationId ? { id: integrationId } : {};
    return this.callTool('get_wallet_integration', args);
  }

  /** List available action types + their config fields (web3 / discord / …). */
  async listActionSchemas(category?: string): Promise<unknown> {
    return this.callTool('list_action_schemas', category ? { category } : {});
  }
}

export default KeeperHubClient;
