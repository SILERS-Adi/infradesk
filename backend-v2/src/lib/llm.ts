import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { prisma } from './prisma';
import { logger } from './logger';

let clientSingleton: Anthropic | null = null;

function client(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  if (!clientSingleton) {
    clientSingleton = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }
  return clientSingleton;
}

const MODEL_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
};

const USD_TO_PLN = 4.1;

function estimateCostPln(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES_USD_PER_MTOK[model] ?? MODEL_PRICES_USD_PER_MTOK['claude-haiku-4-5-20251001']!;
  const usd = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Number((usd * USD_TO_PLN).toFixed(4));
}

export interface CompleteArgs {
  workspaceId: string;
  userId?: string;
  feature: string;
  model?: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface CompleteResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costPln: number;
  model: string;
}

export async function complete(args: CompleteArgs): Promise<CompleteResult> {
  const model = args.model ?? config.LLM_MODEL_COPILOT;
  const maxTokens = args.maxTokens ?? config.LLM_MAX_TOKENS_DEFAULT;

  const response = await client().messages.create({
    model,
    max_tokens: maxTokens,
    temperature: args.temperature ?? 0.7,
    system: args.system,
    messages: args.messages,
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costPln = estimateCostPln(model, inputTokens, outputTokens);

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');

  try {
    await prisma.llmUsage.create({
      data: {
        workspaceId: args.workspaceId,
        userId: args.userId,
        model,
        feature: args.feature,
        inputTokens,
        outputTokens,
        costPln,
      },
    });
  } catch (err) {
    logger.warn({ err }, '[llm] failed to record LlmUsage');
  }

  return { text, inputTokens, outputTokens, costPln, model };
}
