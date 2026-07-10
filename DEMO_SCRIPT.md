# Demo Video Script (≤ 5 minutes)

> Draft. Final recording during the hackathon build phase (Jul 27 – Aug 13),
> so the on-chain transaction shown is one the **agent executed** during the
> hackathon (a submission requirement).
>
> Target: a screen recording, ~4–5 min, no narration needed (captions OK).
> Show the full sense → decide → act → audit loop with a real on-chain
> transaction via KeeperHub.

## Setup (off-camera, ~10s)

- Terminal: `cd agent && bun install && elizaos dev` → backend on
  `http://localhost:3000`, agent "Risk Guardian" loaded.
- `.env` has `KEEPERHUB_API_KEY`, `DEEPSEEK_API_KEY`, and
  `KEEPERHUB_WATCH_WALLET=<an Aave V3 Sepolia position with debt>`.
- Keep an Etherscan (Sepolia) tab open.

## Script

### 0:00–0:30 — The problem (one line + repo)
- Frame: "Most agent hackathons reward reasoning. The hard part is acting
  on-chain. This is an agent that protects an Aave position from liquidation —
  and actually executes the protective transaction through KeeperHub."
- Show the repo: `README.md` — the architecture diagram (sense → decide → act
  → audit via KeeperHub MCP).

### 0:30–1:15 — Sense (the guardian reads the position)
- In the agent chat UI, ask: *"Check the Aave health of 0xAbC… on Sepolia."*
- The agent calls `GET_AAVE_HEALTH` through KeeperHub
  (`aave-v3/get-user-account-data`). Show the response: health factor,
  collateral, debt, and a safe/at-risk verdict.
- Point out: this is a real Aave V3 read, routed through KeeperHub's MCP server.

### 1:15–2:00 — Decide + Act (the protective on-chain transaction)
- The AAVE_HEALTH provider injects the health factor each turn. When it's
  below threshold (1.5), the agent decides to act **without being asked** —
  that's the guardian.
- The agent calls `AAVE_REPAY` through KeeperHub
  (`execute_protocol_action`, `actionType: aave-v3/repay`).
- Show KeeperHub signing with the managed wallet, **gas sponsored**, MEV-protected
  submission. Show the returned transaction hash + Etherscan link.

### 2:00–2:45 — On-chain confirmation
- Open the Etherscan link in the second tab. Show the transaction: confirmed,
  from the KeeperHub managed wallet, to the Aave V3 Pool, function `repay`.
- "A transaction the agent executed through KeeperHub — the hackathon's core
  requirement."

### 2:45–3:30 — Audit trail (reliability & observability)
- Ask: *"Show me the audit trail."* The agent calls `GET_EXECUTION_AUDIT`
  (`get_execution`). Show: execution trace (trigger → repay), per-node statuses,
  gas used (sponsored), timestamps, transaction hash.
- "Every action is logged — this is the observability the judging criteria ask
  for, and it's built into KeeperHub, not something we bolted on."

### 3:30–4:15 — The execution layer (why KeeperHub, not raw RPC)
- Quick tour of `src/plugins/keeperhub/client.ts`: the MCP client. Point at
  `executeProtocolAction`, `executeWorkflow`/`getExecution`. Mention: managed
  wallet + gas sponsorship + smart gas estimation + private routing + audit
  trail — all used, all from KeeperHub.

### 4:15–4:45 — Target users + status
- "For DeFi borrowers who want automated liquidation protection, and treasury
  operators who need a keeper. Status: core path proven before the build phase;
  the sense→act→audit loop runs; on-chain transactions execute through
  KeeperHub with gas sponsored."

### 4:45–5:00 — Close
- Repo URL on screen. "Risk Guardian — an AI agent that acts on-chain through
  KeeperHub."

## Checklist before recording
- [ ] An Aave V3 Sepolia position with debt is set up for the watched wallet
      (supply collateral → borrow). See `PLAN.md` Phase 1.
- [ ] The agent, running in `elizaos dev`, executes the repay via its
      `AAVE_REPAY` action (not a manual probe) — so the tx is
      "agent-executed".
- [ ] Etherscan link works; the tx is from the KeeperHub managed wallet to
      the Aave V3 Pool.
- [ ] Captions ready (English, for US-engineer judges).
