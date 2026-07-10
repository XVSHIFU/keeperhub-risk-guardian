# Submission Checklist — KeeperHub - Agents Onchain Hackathon

> Deadline: **Aug 13, 2026, 12:00 UTC+2** (aim to submit by Aug 12, 24h buffer).
> Submit on: <https://dorahacks.io/hackathon/agents-onchain>
> Each item below is a hard submission requirement (incomplete submissions
> cannot be judged).

## Submission requirements (from the DoraHacks page)

- [x] **Public GitHub repo** — <https://github.com/XVSHIFU/keeperhub-risk-guardian> (MIT).
- [ ] **Demo video (≤ 5 min)** — record during build phase per `DEMO_SCRIPT.md`;
      shows the agent executing on-chain through KeeperHub.
- [ ] **A link to a transaction the agent executed via KeeperHub** — to be
      captured during the build phase when the agent (running in `elizaos dev`)
      triggers `AAVE_REPAY` (or `AAVE_SUPPLY`). Placeholder:
      `https://sepolia.etherscan.io/tx/<TX_HASH>` (replace before submit).
- [ ] **Product description** (target users + work during the hackathon) — see
      below; paste into the DoraHacks submission form.

## Product description (paste into the submission form)

**KeeperHub Risk Guardian** is a DeFi risk-guardian AI agent that protects Aave
V3 borrowers from liquidation. It watches a position's health factor, and when
it drops toward the liquidation threshold, the agent **executes a protective
on-chain action — Aave repay (reduce debt) or supply (add collateral) — through
KeeperHub**, the hackathon's required on-chain execution layer.

The agent reasons; KeeperHub acts. Every protective action is signed by
KeeperHub's managed (Turnkey-backed) wallet, gas-sponsored, MEV-protected, and
recorded with a full audit trail (trigger → simulation → submitted tx → gas →
outcome → timestamp). The agent never holds a private key or pre-funds gas.

**How it works (sense → decide → act → audit):**
1. **Sense** — an `AAVE_HEALTH` provider reads the watched wallet's Aave V3
   health factor every turn through KeeperHub (`aave-v3/get-user-account-data`)
   and injects a safe/at-risk verdict into the agent's context.
2. **Decide** — when the health factor drops below the threshold (default 1.5),
   the agent chooses the smallest action that restores safety (repay vs supply).
3. **Act** — it executes the action through KeeperHub's MCP server
   (`execute_protocol_action`, `actionType: aave-v3/repay`). Real on-chain
   transaction, gas-sponsored.
4. **Audit** — `GET_EXECUTION_AUDIT` pulls the trail
   (`get_execution`: executionTrace, per-node statuses, gas, tx hash, Etherscan
   link, timestamps).

**Target users:** DeFi borrowers who want automated liquidation protection
without babysitting positions; treasury/vault operators who need a keeper that
detects risk and acts on a schedule or event; agent builders looking for a
reference for "agent → KeeperHub → real on-chain tx with observability".

**KeeperHub surfaces used:** MCP server (the execution surface), DeFi protocol
actions (`aave-v3/repay`, `/supply`, `/get-user-account-data`), managed wallet +
gas sponsorship, smart gas estimation + private routing, and the audit trail
(`get_execution`). See `ONBOARDING.md` for a teardown of where onboarding can
improve (Best Onboarding UX bounty).

**Tech:** ElizaOS 1.7.2 (bun, React+Vite client), KeeperHub MCP server, DeepSeek
LLM, Sepolia (testnet) → Ethereum mainnet (gas-sponsored), TypeScript.

**Work during the hackathon (Jul 27 – Aug 13):** the sense→decide→act→audit
decision loop, the live Aave repay test, the guardian dashboard, the demo
video, and this submission. The pre-build Phase 0 (API discovery, MCP client,
guardian action scaffolding, type/build/test green) is documented in the repo
status section of `README.md`.

## Submission form fields (anticipated)

- **GitHub:** https://github.com/XVSHIFU/keeperhub-risk-guardian
- **Demo video:** `<YouTube or Loom URL>` — record per `DEMO_SCRIPT.md`
- **Transaction link:** `https://sepolia.etherscan.io/tx/<TX_HASH>` — the
  agent's `AAVE_REPAY` execution (replace before submit)
- **Project name:** KeeperHub Risk Guardian
- **One-liner:** A DeFi risk-guardian agent that protects Aave V3 borrowers
  from liquidation by executing protective on-chain actions through KeeperHub.
- **Built solo / team:** (fill in at submit time)

## Pre-submit checklist (Aug 12)
- [ ] `bun run type-check && bun run build && bun test` all green.
- [ ] Repo's `README.md` "Project status" reflects final build-phase state.
- [ ] Demo video ≤ 5 min, shows a real agent-executed on-chain tx via KeeperHub.
- [ ] Transaction link is the agent's repay (Etherscan works, from the managed
      wallet to the Aave V3 Pool).
- [ ] Product description above pasted into the form.
- [ ] Submit before 12:00 UTC+2 Aug 13 (aim Aug 12).
