/**
 * KeeperHub Transfer Action
 * 
 * Enables the AI agent to transfer native tokens or ERC-20 tokens
 * through KeeperHub's Direct Execution API.
 */
import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from '@elizaos/core';
import { z } from 'zod';
import { KeeperHubClient } from '../client.ts';

/**
 * Schema for transfer parameters extracted from natural language.
 */
const transferSchema = z.object({
  network: z.string().describe('Blockchain network: ethereum, sepolia, base, polygon, arbitrum'),
  recipientAddress: z.string().describe('Destination wallet address (0x...)'),
  amount: z.string().describe('Amount in human-readable units, e.g. "0.1"'),
  tokenAddress: z.string().optional().describe('ERC-20 token contract address (omit for native token)'),
  simulate: z.boolean().optional().describe('Set true to simulate without broadcasting'),
});

export const transferAction: Action = {
  name: 'TRANSFER',
  similes: ['SEND', 'SEND_TOKENS', 'TRANSFER_TOKENS', 'SEND_ETH', 'TRANSFER_ETH', 'PAY'],
  description: 'Transfer native tokens (ETH, MATIC) or ERC-20 tokens to a wallet address through KeeperHub on-chain execution',

  validate: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<boolean> => {
    const apiKey = runtime.getSetting('KEEPERHUB_API_KEY');
    return !!apiKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    const apiKey = runtime.getSetting('KEEPERHUB_API_KEY');
    const baseUrl = runtime.getSetting('KEEPERHUB_BASE_URL') || 'https://app.keeperhub.com';
    const defaultNetwork = runtime.getSetting('KEEPERHUB_DEFAULT_NETWORK') || 'sepolia';

    if (!apiKey) {
      return {
        text: 'KeeperHub API key not configured. Please set KEEPERHUB_API_KEY.',
        success: false,
        error: new Error('Missing KEEPERHUB_API_KEY'),
      };
    }

    const client = new KeeperHubClient(apiKey, baseUrl);

    try {
      // Extract transfer params from the message content
      // The LLM should have parsed the user's intent into structured content
      const content = message.content as any;
      
      const network = content.network || defaultNetwork;
      const recipientAddress = content.recipientAddress || content.to;
      const amount = content.amount;
      const tokenAddress = content.tokenAddress || content.token;
      const simulate = content.simulate === true || content.simulate === 'true';

      if (!recipientAddress || !amount) {
        // Ask the LLM to extract params (fallback)
        await callback({
          text: 'I need more details to execute the transfer. Please provide:\n- Recipient wallet address (0x...)\n- Amount to send\n- Network (optional, defaults to Sepolia)',
          action: 'TRANSFER',
        });
        return {
          text: 'Missing required parameters for transfer',
          success: false,
          error: new Error('Missing recipientAddress or amount'),
        };
      }

      logger.info(`[KeeperHub] Executing transfer: ${amount} to ${recipientAddress} on ${network}`);

      const result = await client.transfer({
        network,
        recipientAddress,
        amount,
        ...(tokenAddress ? { tokenAddress } : {}),
        simulate,
      });

      const responseText = simulate
        ? `🔄 **Simulation Result**\n` +
          `- From: \`${result.from}\`\n` +
          `- To: \`${result.to}\`\n` +
          `- Amount: ${amount} ${tokenAddress ? 'tokens' : 'native'}\n` +
          `- Gas Estimate: ${result.gasEstimate} wei\n` +
          `- Would Revert: ${result.wouldRevert ? '⚠️ Yes - ' + result.revertReason : '✅ No'}\n` +
          `- Status: ${result.status}`
        : `✅ **Transaction Executed**\n` +
          `- Execution ID: \`${result.executionId}\`\n` +
          `- Status: ${result.status}\n` +
          (result.transactionHash ? `- TX Hash: \`${result.transactionHash}\`\n` : '') +
          (result.transactionLink ? `- Explorer: ${result.transactionLink}\n` : '');

      await callback({
        text: responseText,
        action: 'TRANSFER',
        data: result,
      });

      return {
        text: responseText,
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[KeeperHub] Transfer failed: ${errorMsg}`);

      await callback({
        text: `❌ **Transfer Failed**\nError: ${errorMsg}`,
        action: 'TRANSFER',
        error: errorMsg,
      });

      return {
        text: `Transfer failed: ${errorMsg}`,
        success: false,
        error: error instanceof Error ? error : new Error(errorMsg),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Send 0.01 ETH to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb on Sepolia',
        },
      },
      {
        name: 'KeeperHub Agent',
        content: {
          text: '✅ Transaction Executed\n- Execution ID: `direct_abc123`\n- Status: completed\n- TX Hash: `0x...`\n- Explorer: https://sepolia.etherscan.io/tx/0x...',
          actions: ['TRANSFER'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Simulate sending 100 USDC to 0xAbC... on Base',
        },
      },
      {
        name: 'KeeperHub Agent',
        content: {
          text: '🔄 Simulation Result\n- From: `0x...`\n- To: `0x...`\n- Amount: 100 USDC\n- Gas Estimate: 85000 wei\n- Would Revert: ✅ No',
          actions: ['TRANSFER'],
        },
      },
    ],
  ],
};