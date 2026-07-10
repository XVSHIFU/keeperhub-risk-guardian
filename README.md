# KeeperHub Risk Guardian

> An AI agent that protects DeFi borrowers from liquidation by executing protective on-chain actions (Aave repay / supply) **through [KeeperHub](https://keeperhub.com)** — the execution and reliability layer for on-chain agents.

Built for the **KeeperHub - Agents Onchain Hackathon** (Jul 27 – Aug 13, 2026).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![ElizaOS](https://img.shields.io/badge/ElizaOS-1.7.2-blueviolet)](https://elizaos.com)
[![KeeperHub](https://img.shields.io/badge/Execution-KeeperHub%20MCP-orange)](https://docs.keeperhub.com)

---

## The last mile problem

Most agent hackathons reward an agent that *decides* something clever. The harder problem is what happens next: when an agent needs to actually move value on-chain, it hits a wall of failed transactions, gas spikes, MEV, and zero observability.

**KeeperHub Risk Guardian** closes that last mile. It monitors a DeFi position, decides when it's at risk, and **acts on-chain through KeeperHub** — with gas sponsorship, retries, and a full audit trail. The agent reasons; KeeperHub lets it act.

## What it does

A **DeFi risk guardian** for Aave V3 borrowers:

1. **Sense** — reads the Aave V3 health factor for a watched wallet (`aave-v3/get-user-account-data`).
2. **Decide** — if the health factor drops below a safety threshold (e.g. `< 1.5`), the agent triggers a protective action.
3. **Act** — executes the action **through KeeperHub**: `aave-v3/repay` (reduce debt) or `aave-v3/supply` (add collateral), signed by KeeperHub's managed wallet, gas-sponsored.
4. **Audit** — every execution is recorded with the full trail (trigger → simulation → submitted tx → gas used → outcome → timestamp), surfaced via `get_execution` and shown in the dashboard.

```
watch wallet ──► read health factor ──► below threshold? ──► repay/supply via KeeperHub ──► on-chain tx + audit trail
   (Aave V3)        (KeeperHub MCP)         (agent logic)         (KeeperHub MCP)              (Etherscan)
```

## Target users

- **DeFi borrowers** who want automated liquidation protection without babysitting their positions.
- **Treasury / vault operators** who need a keeper that detects risk and acts on it on a schedule or event.
- **Agent builders** looking for a reference for "agent → KeeperHub → real on-chain tx" with observability.

## Why KeeperHub (not just any RPC)

KeeperHub is the **required on-chain execution layer** for this hackathon — and the right tool for the job:

| Capability | What it gives the guardian |
|---|---|
| **MCP server** | The agent discovers and calls execution capabilities natively (`execute_protocol_action`, `execute_transfer`, `create_workflow`, `get_execution`). |
| **Managed wallet + gas sponsorship** | Writes are signed by KeeperHub's Turnkey-backed wallet; **gas is sponsored** — no ETH pre-funding, no key management. |
| **DeFi protocol actions** | 435 pre-built actions (Aave V3/V4, Aerodrome, …) — `repay`/`supply`/`borrow` without hand-rolling ABI calls. |
| **Smart gas estimation + private routing** | Adaptive gas with exponential backoff; MEV-protected submission paths. |
| **Audit trail** | `get_execution` returns `executionTrace`, per-node statuses, gas used, tx hash, explorer link, and timestamps — observability for free. |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  ElizaOS Agent (character.ts + keeperhub plugin)            │
│  ┌─────────────────┐   ┌──────────────────────────────────┐ │
│  │ Sense / Decide  │──►│ keeperhub plugin (MCP client)    │ │
│  │ (LLM + rules)   │   │  src/plugins/keeperhub/client.ts │ │
│  └─────────────────┘   └──────────────┬───────────────────┘ │
└─────────────────────────────────────────┼────────────────────┘
                                          │ JSON-RPC over HTTP
                                          ▼
                  https://app.keeperhub.com/mcp  (KeeperHub)
                          │
                  ┌───────┴────────┬──────────────┐
                  ▼                ▼              ▼
           execute_protocol   get_execution   list_action_schemas
           _action (repay)    (audit trail)    (discover actions)
                          │
                          ▼
              Aave V3 on-chain  (gas-sponsored)
```

**Plugin structure** (`src/plugins/keeperhub/`):
- `client.ts` — MCP client (JSON-RPC 2.0 over `POST /mcp`, session management, lazy re-init on expiry). Exposes `executeProtocolAction`, `transfer`, `contractCall`, `createWorkflow`/`executeWorkflow`/`getExecution`, `searchProtocolActions`, `getWalletIntegration`.
- `actions/getHealth.ts` — `GET_AAVE_HEALTH`: read Aave V3 health factor (sense).
- `actions/repay.ts` — `AAVE_REPAY`: repay Aave debt via KeeperHub (act).
- `actions/getExecutionAudit.ts` — `GET_EXECUTION_AUDIT`: pull the audit trail (audit).
- `actions/transfer.ts`, `actions/checkBalance.ts` — generic transfer / balance actions.
- `deepseek.ts` — DeepSeek model provider (OpenAI-compatible chat completions).
- `index.ts` — plugin definition (actions + model provider + status provider).

## Getting started

### Prerequisites
- [Bun](https://bun.sh) (required by ElizaOS)
- A KeeperHub account + organization API key (`kh_…`) — create one at [app.keeperhub.com](https://app.keeperhub.com) → Settings → API Keys → Organisation tab. A managed wallet is provisioned automatically.

### Install & run

```bash
bun install
cp .env.example .env       # then edit .env: set KEEPERHUB_API_KEY=kh_...
elizaos dev                 # starts backend on http://localhost:3000 + client UI
```

Environment (`.env`):

| Var | Required | Purpose |
|---|---|---|
| `KEEPERHUB_API_KEY` | ✅ | Org API key (`kh_…`) — authenticates MCP calls |
| `DEEPSEEK_API_KEY` | ✅ | LLM for the agent (OpenAI-compatible) |
| `KEEPERHUB_DEFAULT_NETWORK` | | Default chain ID (default `11155111` = Sepolia) |

### Try the KeeperHub path directly

The repo includes read-only probe scripts (no on-chain write):

```bash
KEEPERHUB_API_KEY=kh_… bun run scripts/test-mcp-client.ts        # smoke-test the MCP transport
KEEPERHUB_API_KEY=kh_… bun run scripts/probe-protocol-actions.ts # list 435 DeFi actions
KEEPERHUB_API_KEY=kh_… bun run scripts/dump-aave-action.ts        # full schema of an Aave action
```

## Project status (hackathon)

> Phase 0 (pre-build, completed 2026-07-10): the core path is **proven** before the build phase even opens.

- ✅ **A real on-chain transaction executed through KeeperHub** (Sepolia test transfer; `status: success`, gas-sponsored, with tx hash + Etherscan link + audit trail) — the hackathon's highest-weighted criterion, validated viable.
- ✅ `keeperhub` plugin rewritten as an MCP client (the earlier draft POSTed to non-existent REST endpoints; KeeperHub exposes execution as **MCP tools**, not REST).
- ✅ Bun-runtime MCP transport verified (`initialize → notifications/initialized → tools/call`, response parsing, full un-redacted data).
- ✅ DeFi write-side mapped: Aave V3 `repay` / `supply` / `get-user-account-data` confirmed callable via `executeProtocolAction({ actionType: "aave-v3/repay", … })`. The sense step (`get-user-account-data`) is live-verified — it returns real Aave health-factor data.
- ✅ Managed wallet + gas sponsorship confirmed (no ETH pre-funding needed).
- ✅ Risk-guardian actions scaffolded in the plugin: `GET_AAVE_HEALTH` (sense), `AAVE_REPAY` (act), `GET_EXECUTION_AUDIT` (audit), plus generic `TRANSFER` / `CHECK_BALANCE`.
- ⏳ Build phase (Jul 27 – Aug 13): wire the sense→decide→act **decision loop** (LLM + threshold rules) into the ElizaOS agent, custom guardian dashboard, demo video, submission.

## Development

```bash
bun install
bun run type-check      # tsc --noEmit — clean
bun run build           # builds dist/ — clean
bun test                # 69 passing
elizaos dev             # backend on http://localhost:3000 + client UI
```

> The repo ships the ElizaOS starter's product tests (actions, plugin, integration, etc.). The starter's template-conformance tests (which asserted the repo still matched the vanilla starter — e.g. `tsup.config.ts`, starter README wording) were removed since the project is customized for the hackathon. Unit tests for the keeperhub actions are a build-phase TODO.

## Tech stack

- **Agent framework:** ElizaOS 1.7.2 (`bun`, React+Vite client UI)
- **Execution layer:** KeeperHub MCP server (`https://app.keeperhub.com/mcp`)
- **LLM:** DeepSeek (OpenAI-compatible chat completions)
- **Chains:** Sepolia (testnet) → Ethereum mainnet (gas-sponsored)
- **Language:** TypeScript

## License

MIT — see [LICENSE](./LICENSE).

## Links

- Hackathon: <https://dorahacks.io/hackathon/agents-onchain>
- KeeperHub docs: <https://docs.keeperhub.com>
- KeeperHub MCP: <https://docs.keeperhub.com/ai-tools/mcp-server>

## Project docs

- [`ONBOARDING.md`](./ONBOARDING.md) — teardown of where building a KeeperHub agent gets stuck (and the fixes). Submitted for the Best Onboarding UX bounty.
- [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) — the ≤5-min demo video script.
- [`SUBMISSION.md`](./SUBMISSION.md) — submission checklist + product description (target users + work during the hackathon).

---

*中文文档见 [README.zh-CN.md](./README.zh-CN.md).*
