# KeeperHub 风险守卫（Risk Guardian）

> 一个保护 DeFi 借款人免遭清算的 AI Agent——通过 **[KeeperHub](https://keeperhub.com)**（链上 Agent 的执行与可靠性层）执行保护性链上动作（Aave 还款 / 补仓）。

为 **KeeperHub - Agents Onchain 黑客松**（2026/7/27–8/13）而建。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![ElizaOS](https://img.shields.io/badge/ElizaOS-1.7.2-blueviolet)](https://elizaos.com)
[![KeeperHub](https://img.shields.io/badge/执行层-KeeperHub%20MCP-orange)](https://docs.keeperhub.com)

> 英文版见 [README.md](./README.md)（提交给评委的主 README，英文因评委是美国工程师）。

---

## "最后一公里"问题

大多数 Agent 黑客松奖励的是"能做出聪明决策"的 Agent。更难的问题在决策之后：当 Agent 需要真正在链上转移价值时，会撞上失败交易、Gas 飙升、MEV、零可观测性的墙。

**KeeperHub 风险守卫**补上这最后一公里。它监控 DeFi 仓位、判断风险、并**通过 KeeperHub 在链上行动**——带 Gas 赞助、重试、完整审计轨迹。Agent 负责推理，KeeperHub 让它能动。

## 它做什么

一个面向 Aave V3 借款人的 **DeFi 风险守卫**：

1. **感知**——读取被监控钱包的 Aave V3 健康因子（`aave-v3/get-user-account-data`）。
2. **决策**——健康因子跌破安全阈值（如 `< 1.5`）时，触发保护性动作。
3. **执行**——**经 KeeperHub** 执行：`aave-v3/repay`（还债降杠杆）或 `aave-v3/supply`（补保证金），由 KeeperHub 托管钱包签名，Gas 赞助。
4. **审计**——每次执行记录完整轨迹（触发→模拟→提交→Gas→结果→时间戳），通过 `get_execution` 拿到并展示在 dashboard。

```
监控钱包 ──► 读健康因子 ──► 跌破阈值? ──► 经 KeeperHub 还款/补仓 ──► 链上交易 + 审计轨迹
 (Aave V3)   (KeeperHub MCP)   (Agent 逻辑)      (KeeperHub MCP)         (Etherscan)
```

## 目标用户

- **DeFi 借款人**：想要自动清算保护、不用盯着仓位的人。
- **金库 / 资金管理方**：需要 keeper 检测风险并按计划/事件行动的运营者。
- **Agent 开发者**：想要一个"Agent → KeeperHub → 真实链上交易 + 可观测性"的参考实现。

## 为什么用 KeeperHub（而不是裸 RPC）

KeeperHub 是本次黑客松**指定的链上执行层**——也正好是适合的工具：

| 能力 | 给守卫带来什么 |
|---|---|
| **MCP server** | Agent 原生发现并调用执行能力（`execute_protocol_action`、`execute_transfer`、`create_workflow`、`get_execution`）。 |
| **托管钱包 + Gas 赞助** | 写入由 KeeperHub 的 Turnkey 托管钱包签名；**Gas 被赞助**——无需预存 ETH，无需管私钥。 |
| **DeFi 协议动作** | 435 个预制动作（Aave V3/V4、Aerodrome 等）——`repay`/`supply`/`borrow` 不用手写 ABI 调用。 |
| **智能 Gas 估计 + 私有路由** | 自适应 Gas + 指数退避；MEV 保护提交路径。 |
| **审计轨迹** | `get_execution` 返回 `executionTrace`、每节点状态、Gas、tx hash、浏览器链接、时间戳——可观测性白送。 |

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│  ElizaOS Agent（character.ts + keeperhub 插件）              │
│  ┌─────────────────┐   ┌──────────────────────────────────┐ │
│  │ 感知 / 决策      │──►│ keeperhub 插件（MCP 客户端）     │ │
│  │ (LLM + 规则)     │   │  src/plugins/keeperhub/client.ts │ │
│  └─────────────────┘   └──────────────┬───────────────────┘ │
└─────────────────────────────────────────┼────────────────────┘
                                          │ JSON-RPC over HTTP
                                          ▼
                  https://app.keeperhub.com/mcp  (KeeperHub)
                          │
                  ┌───────┴────────┬──────────────┐
                  ▼                ▼              ▼
           execute_protocol   get_execution   list_action_schemas
           _action (repay)    (审计轨迹)       (发现动作)
                          │
                          ▼
              Aave V3 链上  (Gas 赞助)
```

**插件结构**（`src/plugins/keeperhub/`）：
- `client.ts`——MCP 客户端（JSON-RPC 2.0 over `POST /mcp`，session 管理，过期懒重连）。暴露 `executeProtocolAction`、`transfer`、`contractCall`、`createWorkflow`/`executeWorkflow`/`getExecution`、`searchProtocolActions`、`getWalletIntegration`。
- `actions/getHealth.ts`——`GET_AAVE_HEALTH`：读 Aave V3 健康因子（感知）。
- `actions/repay.ts`——`AAVE_REPAY`：经 KeeperHub 还 Aave 债（执行）。
- `actions/getExecutionAudit.ts`——`GET_EXECUTION_AUDIT`：拉取审计轨迹（审计）。
- `actions/transfer.ts`、`actions/checkBalance.ts`——通用转账 / 余额动作。
- `deepseek.ts`——DeepSeek 模型 provider（OpenAI 兼容 chat completions）。
- `index.ts`——插件定义（动作 + 模型 provider + 状态 provider）。

## 快速开始

### 前置
- [Bun](https://bun.sh)（ElizaOS 要求）
- KeeperHub 账号 + 组织 API key（`kh_…`）——在 [app.keeperhub.com](https://app.keeperhub.com) → Settings → API Keys → Organisation tab 创建。会自动配一个托管钱包。

### 安装与运行

```bash
bun install
cp .env.example .env       # 编辑 .env：设 KEEPERHUB_API_KEY=kh_...
elizaos dev                 # 后端起在 http://localhost:3000 + 客户端 UI
```

环境变量（`.env`）：

| 变量 | 必填 | 用途 |
|---|---|---|
| `KEEPERHUB_API_KEY` | ✅ | 组织 API key（`kh_…`）——MCP 调用认证 |
| `DEEPSEEK_API_KEY` | ✅ | Agent 的 LLM（OpenAI 兼容） |
| `KEEPERHUB_DEFAULT_NETWORK` | | 默认链 ID（默认 `11155111` = Sepolia） |

### 直接试 KeeperHub 路径

仓库含只读探查脚本（不上链写入）：

```bash
KEEPERHUB_API_KEY=kh_… bun run scripts/test-mcp-client.ts        # MCP transport 冒烟测试
KEEPERHUB_API_KEY=kh_… bun run scripts/probe-protocol-actions.ts # 列 435 个 DeFi 动作
KEEPERHUB_API_KEY=kh_… bun run scripts/dump-aave-action.ts        # Aave 动作的完整 schema
```

## 项目状态（黑客松）

> Phase 0（赛前预热，2026-07-10 完成）：核心路径在构建期开赛前**已验证**。

- ✅ **经 KeeperHub 执行了一笔真实链上交易**（Sepolia 测试转账；`status: success`，Gas 赞助，带 tx hash + Etherscan 链接 + 审计轨迹）——黑客松最高权重项，已验证可行。
- ✅ `keeperhub` 插件重写为 MCP 客户端（早期草稿 POST 到不存在的 REST 端点；KeeperHub 的执行能力是 **MCP 工具**，不是 REST）。
- ✅ Bun 运行时 MCP transport 验证（`initialize → notifications/initialized → tools/call`，响应解析，完整未脱敏数据）。
- ✅ DeFi 写入侧摸清：Aave V3 `repay` / `supply` / `get-user-account-data` 确认可经 `executeProtocolAction({ actionType: "aave-v3/repay", … })` 调用。感知步（`get-user-account-data`）已 live 验证——返回真实 Aave 健康因子数据。
- ✅ 托管钱包 + Gas 赞助确认（无需预存 ETH）。
- ✅ 守卫动作已 scaffold 进插件：`GET_AAVE_HEALTH`（感知）、`AAVE_REPAY`（执行）、`GET_EXECUTION_AUDIT`（审计），加通用 `TRANSFER` / `CHECK_BALANCE`。
- ⏳ 构建期（7/27–8/13）：把"感知→决策→执行"的**决策环**（LLM + 阈值规则）接进 ElizaOS Agent、自定义守卫 dashboard、录 demo 视频、提交。

## 开发

```bash
bun install
bun run type-check      # tsc --noEmit —— 全绿
bun run build           # 构建 dist/ —— 全绿
bun test                # 69 项通过
elizaos dev             # 后端起在 http://localhost:3000 + 客户端 UI
```

> 仓库含 ElizaOS starter 的产品测试（actions、plugin、integration 等）。starter 的模板合规性测试（断言仓库仍是 vanilla starter——如要求 `tsup.config.ts`、starter README 措辞）已移除，因项目已为黑客松定制。keeperhub 动作的单元测试留构建期补。

## 技术栈

- **Agent 框架**：ElizaOS 1.7.2（`bun`，React+Vite 客户端 UI）
- **执行层**：KeeperHub MCP server（`https://app.keeperhub.com/mcp`）
- **LLM**：DeepSeek（OpenAI 兼容 chat completions）
- **链**：Sepolia（测试网）→ Ethereum 主网（Gas 赞助）
- **语言**：TypeScript

## License

MIT——见 [LICENSE](./LICENSE)。

## 链接

- 黑客松：<https://dorahacks.io/hackathon/agents-onchain>
- KeeperHub 文档：<https://docs.keeperhub.com>
- KeeperHub MCP：<https://docs.keeperhub.com/ai-tools/mcp-server>
