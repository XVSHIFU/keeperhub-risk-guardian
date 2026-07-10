# Building a KeeperHub Agent — Where I Got Stuck (and the fixes)

> A teardown for the **Best Onboarding UX Improvement** bounty. Fresh eyes are
> the fastest way to make an open-source project better, so here is an honest
> account of every place a new builder trips when wiring an AI agent to
> KeeperHub's on-chain execution — and the concrete fix for each.
>
> The fixes are implemented in this repo's `keeperhub` plugin. The hope is that
> some of these become upstream docs / starter-template improvements so the
> next builder goes from zero to first on-chain transaction faster.

## TL;DR

KeeperHub's real on-chain surface is the **MCP server**, not REST. The single
biggest onboarding trap is assuming a REST shape that doesn't exist. Everything
below flows from that.

---

## 1. The docs imply a REST execution API. It isn't REST.

**Where I got stuck.** The natural assumption — and the assumption an earlier
draft of this project's client made — is that on-chain execution is a set of
REST endpoints like `POST /api/execute/transfer`. Those paths **return 404 / fail
to fetch on the live server**. I burned a round trying to debug "why does my
transfer 404" before realizing the endpoints simply don't exist.

**The reality.** KeeperHub exposes execution as **MCP tools** over the Model
Context Protocol at `POST https://app.keeperhub.com/mcp`:

| Tool | What it does |
|---|---|
| `execute_transfer` | native / ERC-20 transfer from the org wallet |
| `execute_contract_call` | call any contract function (view returns result; write submits) |
| `execute_check_and_execute` | read → condition → conditional write |
| `execute_protocol_action` | DeFi protocol actions (Aave repay/supply/…, 435 total) |
| `get_direct_execution_status` | status of a direct execution |
| `create_workflow` / `execute_workflow` / `get_execution` | visual-workflow mode |

**Fix in this repo.** `src/plugins/keeperhub/client.ts` is an MCP client
(JSON-RPC 2.0 over HTTP), not a REST wrapper.

**Suggested upstream fix.** Make the docs lead with "execution is MCP-first";
add a one-line "there is no `/api/execute/*` REST surface" note to head off the
assumption. The OpenAPI at `/openapi.json` already lists workflow REST
endpoints — a parallel "MCP is the execution surface" framing would close the
gap.

## 2. Direct-execution tools use `snake_case`. Workflow actions use `camelCase`.

**Where I got stuck.** The workflow action schemas (`web3/transfer-funds`) use
camelCase (`recipientAddress`, `network`). I assumed the direct-execution tools
matched. They don't — `execute_transfer` wants `chain_id`, `to_address`,
`amount`, `token_address`. Passing `recipientAddress` silently does nothing
useful (the arg just isn't consumed) or errors on validation.

**The reality.** Two different surfaces, two different casing conventions:

- Direct-execution MCP tools → **snake_case** (`chain_id`, `to_address`,
  `function_name`, `gas_limit_multiplier`, `idempotency_key`).
- Workflow *action node configs* → **camelCase** (`recipientAddress`, `network`).

**Fix in this repo.** The client keeps idiomatic camelCase TypeScript interfaces
and **translates** to each tool's actual schema inside the method. Validation is
the schema's job; the client just maps names.

**Suggested upstream fix.** Pick one casing convention across both surfaces, or
document the split prominently. New builders will assume consistency.

## 3. `execute_protocol_action` wraps its args in `params`.

**Where I got stuck.** I called `execute_protocol_action` with the action's
fields at the top level:

```js
execute_protocol_action({ actionType: 'aave-v3/repay', network, asset, amount, onBehalfOf })
```

and got back:

```
Invalid arguments for tool execute_protocol_action:
  path: ["params"], expected record, received undefined
```

**The reality.** The tool's input schema is `{ actionType: string, params: record }`.
The action-specific fields go **inside** `params`:

```js
execute_protocol_action({ actionType: 'aave-v3/repay', params: { network, asset, amount, onBehalfOf } })
```

**Fix in this repo.** `executeProtocolAction({ actionType, params })` in the
client. The `ProtocolActionParams` type makes the shape obvious.

**Suggested upstream fix.** The tool description could include one worked
example with the `params` wrapper, since the nested shape is non-obvious.

## 4. Discovering which DeFi actions exist (and their required fields).

**Where I got stuck.** "Aave repay" is a thing — but what's its `actionType`
string, and which fields does it need? Guessing (`aave/repay`?) wastes a round.

**The reality.** `search_protocol_actions` (no filter) returns all 435 actions
with `actionType`, `requiredFields`, `optionalFields`. Filtering by
`{ protocol: 'aave' }` returned 0 in my testing — the filter key isn't `protocol`
(undocumented). Enumerate all and filter client-side instead.

```bash
KEEPERHUB_API_KEY=kh_… bun run scripts/list-aave-actions.ts   # in this repo
```

For Aave V3 the actions are: `aave-v3/supply`, `/withdraw`, `/borrow`,
`/repay`, `/set-collateral`, `/get-user-account-data` (read), `/get-user-reserve-data` (read).

**Suggested upstream fix.** Document `search_protocol_actions`' filter keys
(what `protocol`/`network`/`actionType` accept), or make `protocol: 'aave'`
match the `aave-v3/*` actions.

## 5. You don't need ETH for gas. (This one's a feature, not a trap.)

**Where I expected to get stuck.** "I need to fund a Sepolia wallet with ETH for
gas before the agent can transact." I went looking for a faucet before testing.

**The reality.** KeeperHub **sponsors gas** — on-chain writes return
`sponsored: true`, and the org's managed (Turnkey) wallet doesn't need
pre-funding. New builders can go from zero → first transaction without touching a
faucet.

**Suggested upstream fix.** Surface this loud-and-clear in the quickstart. It
removes the single biggest "am I about to spend real money?" hesitation for a
new builder.

## 6. The MCP session handshake (for anyone hand-rolling the client).

The MCP Streamable-HTTP transport isn't a single POST — it's a session:

1. `POST /mcp` with JSON-RPC `initialize` → server returns `Mcp-Session-Id` in a
   response header.
2. `POST /mcp` with `notifications/initialized` (no id; no response).
3. `POST /mcp` with `tools/call`, replaying the `Mcp-Session-Id` header.

**Where I got stuck.** Forgetting step 2, or not carrying the session id on
step 3, yields cryptic "session" errors. Also: the response is
`{ content: [{ type: 'text', text: '…' }], isError? }` — the actual payload is
JSON **inside** `content[0].text`, not at the top level. (This repo's
`extractToolContent` unwraps it; the first draft indexed through `.result` one
time too many and every call returned `null`.)

**Suggested upstream fix.** A 10-line "hand-roll an MCP client" snippet
(initialize → initialized → tools/call, with the session header + content
unwrapping) would save everyone an hour.

## 7. Plugin objects vs plugin names.

**Where I got stuck.** The `Character.plugins` field is typed `string[]`
(plugin **names**), but an ElizaOS starter commonly puts a local `Plugin` object
there directly. Result: a TS error (`Type 'Plugin' is not assignable to type
'string'`) that the runtime tolerates but `tsc` flags.

**Fix in this repo.** Plugin objects go in `ProjectAgent.plugins` (in
`src/index.ts`); `Character.plugins` holds name strings only.

---

## The payoff

Once the above is internalized, zero → first on-chain transaction through
KeeperHub is roughly:

1. Create an account at `app.keeperhub.com` (a managed wallet is provisioned).
2. Create an org API key (`kh_…`) under Settings → API Keys.
3. `initialize` → `notifications/initialized` → `tools/call execute_transfer`
   with `{ chain_id, to_address, amount }`.

That's it — no ETH, no private key, no ABI wrangling for DeFi actions. The
friction is entirely in *finding* this path, which is what this teardown hopes to
shorten.

---

*Implemented in `src/plugins/keeperhub/`. Probe scripts under `scripts/` reproduce
each finding read-only. See [README.md](./README.md) for the full project.*
