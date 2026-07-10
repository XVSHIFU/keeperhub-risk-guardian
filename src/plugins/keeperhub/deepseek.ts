/**
 * DeepSeek Model Provider for ElizaOS
 * 
 * Directly calls DeepSeek's chat completions API (OpenAI-compatible),
 * bypassing the ElizaOS OpenAI plugin which uses the newer Responses API.
 */

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

interface DeepSeekConfig {
  apiKey: string;
  baseUrl?: string;
  smallModel?: string;
  largeModel?: string;
}

export class DeepSeekProvider {
  private apiKey: string;
  private baseUrl: string;
  private smallModel: string;
  private largeModel: string;

  constructor(config: DeepSeekConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEEPSEEK_BASE;
    this.smallModel = config.smallModel || 'deepseek-chat';
    this.largeModel = config.largeModel || 'deepseek-chat';
  }

  async chatCompletion(params: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stop?: string[];
  }): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    
    const body = {
      model: params.model || this.largeModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 4096,
      ...(params.stop ? { stop: params.stop } : {}),
      stream: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

let provider: DeepSeekProvider | null = null;

export function getDeepSeekProvider(): DeepSeekProvider {
  if (!provider) {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('DeepSeek API key not configured');
    }
    provider = new DeepSeekProvider({
      apiKey,
      baseUrl: process.env.DEEPSEEK_BASE_URL || DEEPSEEK_BASE,
      smallModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      largeModel: process.env.DEEPSEEK_MODEL_PRO || 'deepseek-chat',
    });
  }
  return provider;
}