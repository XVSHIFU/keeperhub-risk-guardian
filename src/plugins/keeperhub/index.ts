/**
 * KeeperHub Plugin for ElizaOS
 * 
 * Integrates KeeperHub's Direct Execution API as ElizaOS actions,
 * enabling AI agents to execute real on-chain transactions.
 * 
 * ## Features
 * - TRANSFER: Send native tokens or ERC-20 tokens
 * - CHECK_BALANCE: Read wallet/token balances
 * - CONTRACT_CALL: Call any smart contract function
 * - CHECK_STATUS: Monitor transaction execution status
 * 
 * ## Configuration
 * Required env vars:
 * - KEEPERHUB_API_KEY: Your KeeperHub organization API key (kh_ prefix)
 * 
 * Optional env vars:
 * - KEEPERHUB_BASE_URL: API base URL (default: https://app.keeperhub.com)
 * - KEEPERHUB_DEFAULT_NETWORK: Default blockchain network (default: sepolia)
 */
import type { Plugin } from '@elizaos/core';
import {
  type GenerateTextParams,
  ModelType,
  logger,
} from '@elizaos/core';
import { z } from 'zod';
import { transferAction } from './actions/transfer.ts';
import { checkBalanceAction } from './actions/checkBalance.ts';
import { getHealthAction } from './actions/getHealth.ts';
import { repayAction } from './actions/repay.ts';
import { getExecutionAuditAction } from './actions/getExecutionAudit.ts';
import { getDeepSeekProvider } from './deepseek.ts';

const configSchema = z.object({
  KEEPERHUB_API_KEY: z
    .string()
    .min(1, 'KEEPERHUB_API_KEY is required for on-chain execution'),
  KEEPERHUB_BASE_URL: z
    .string()
    .url()
    .optional()
    .default('https://app.keeperhub.com'),
  KEEPERHUB_DEFAULT_NETWORK: z
    .string()
    .optional()
    .default('sepolia'),
});

export const keeperhubPlugin: Plugin = {
  name: 'keeperhub',
  description: 'KeeperHub on-chain execution plugin — enables AI agents to execute real blockchain transactions',
  priority: 100, // High priority so our actions are preferred

  config: {
    KEEPERHUB_API_KEY: process.env.KEEPERHUB_API_KEY || '',
    KEEPERHUB_BASE_URL: process.env.KEEPERHUB_BASE_URL || 'https://app.keeperhub.com',
    KEEPERHUB_DEFAULT_NETWORK: process.env.KEEPERHUB_DEFAULT_NETWORK || 'sepolia',
  },

  async init(config: Record<string, string>) {
    logger.info('[KeeperHub] Initializing plugin...');

    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set environment variables for runtime access
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value !== undefined) {
          process.env[key] = value;
        }
      }

      logger.info('[KeeperHub] Plugin initialized successfully');
      logger.info(`[KeeperHub] Default network: ${validatedConfig.KEEPERHUB_DEFAULT_NETWORK}`);
      logger.info(`[KeeperHub] API endpoint: ${validatedConfig.KEEPERHUB_BASE_URL}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues?.map((e) => `${e.path.join('.')}: ${e.message}`)?.join(', ') || 'Unknown validation error';
        logger.error(`[KeeperHub] Invalid configuration: ${errorMessages}`);
        throw new Error(`KeeperHub plugin configuration error: ${errorMessages}`);
      }
      throw new Error(`KeeperHub plugin init failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  actions: [
    // Risk-guardian flow: sense → act → audit, plus generic transfer/balance.
    getHealthAction, // GET_AAVE_HEALTH   — read Aave health factor (sense)
    repayAction, // AAVE_REPAY        — repay Aave debt via KeeperHub (act)
    getExecutionAuditAction, // GET_EXECUTION_AUDIT — pull audit trail (audit)
    transferAction, // TRANSFER          — generic native/ERC-20 transfer
    checkBalanceAction, // CHECK_BALANCE     — generic balance read
  ],

  // DeepSeek model provider - uses chat completions API (not Responses API)
  models: {
    [ModelType.TEXT_SMALL]: async (
      _runtime,
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      try {
        const provider = getDeepSeekProvider();
        return await provider.chatCompletion({
          messages: [{ role: 'user', content: prompt }],
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          temperature: 0.7,
          max_tokens: 4096,
          stop: stopSequences,
        });
      } catch (error) {
        logger.error(`[DeepSeek] TEXT_SMALL error: ${error}`);
        throw error;
      }
    },
    [ModelType.TEXT_LARGE]: async (
      _runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
      }: GenerateTextParams
    ) => {
      try {
        const provider = getDeepSeekProvider();
        return await provider.chatCompletion({
          messages: [{ role: 'user', content: prompt }],
          model: process.env.DEEPSEEK_MODEL_PRO || 'deepseek-chat',
          temperature,
          max_tokens: maxTokens,
          stop: stopSequences,
        });
      } catch (error) {
        logger.error(`[DeepSeek] TEXT_LARGE error: ${error}`);
        throw error;
      }
    },
  },

  providers: [
    {
      name: 'KEEPERHUB_STATUS',
      description: 'Provides KeeperHub connection status and configuration',
      get: async (runtime, _message, _state) => {
        const apiKey = runtime.getSetting('KEEPERHUB_API_KEY');
        const network = runtime.getSetting('KEEPERHUB_DEFAULT_NETWORK') || 'sepolia';
        const baseUrl = runtime.getSetting('KEEPERHUB_BASE_URL') || 'https://app.keeperhub.com';

        return {
          text: `KeeperHub Status: ${apiKey ? '✅ Connected' : '❌ Not configured'}\nNetwork: ${network}\nEndpoint: ${baseUrl}`,
          values: {
            connected: !!apiKey,
            network,
            baseUrl,
          },
          data: {
            hasApiKey: !!apiKey,
            network,
            baseUrl,
          },
        };
      },
    },
  ],
};

export default keeperhubPlugin;