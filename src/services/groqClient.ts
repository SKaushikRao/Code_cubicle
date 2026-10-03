/**
 * Vikaas AI - Multi-Provider AI Inference Client
 * Supports Groq and OpenRouter with automatic fallbacks.
 * Handles structured JSON completion with model fallbacks and schema validation.
 */
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

export const MODEL_CONFIG = {
  // Groq models - using only available models
  GROQ_HEAVY: process.env.GROQ_HEAVY_MODEL || 'llama-3.1-70b-versatile',
  GROQ_LIGHT: process.env.GROQ_LIGHT_MODEL || 'llama-3.1-8b-instant',
  GROQ_FALLBACK_HEAVY: 'llama-3.1-8b-instant',
  GROQ_FALLBACK_LIGHT: 'llama-3.1-8b-instant',
  // OpenRouter models (uses your $5 free credit)
  OPENROUTER_HEAVY: 'meta-llama/llama-3.1-70b-instruct',
  OPENROUTER_LIGHT: 'meta-llama/llama-3.1-8b-instruct',
  OPENROUTER_FALLBACK: 'meta-llama/llama-3.1-8b-instruct',
};

let groqInstance: Groq | null = null;
let openRouterInstance: OpenAI | null = null;

export function getGroqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() || '';
}

export function getOpenRouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY?.trim() || '';
}

export function getGroqClient(): Groq | null {
  const key = getGroqApiKey();
  if (!key) {
    return null;
  }
  if (!groqInstance || groqInstance.apiKey !== key) {
    groqInstance = new Groq({ apiKey: key });
  }
  return groqInstance;
}

export function getOpenRouterClient(): OpenAI | null {
  const key = getOpenRouterApiKey();
  if (!key) {
    return null;
  }
  if (!openRouterInstance) {
    openRouterInstance = new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }
  return openRouterInstance;
}

export function isGroqConfigured(): boolean {
  const key = getGroqApiKey();
  return Boolean(key && key.length > 10);
}

export function isOpenRouterConfigured(): boolean {
  const key = getOpenRouterApiKey();
  return Boolean(key && key.length > 10);
}

export function isAnyProviderConfigured(): boolean {
  return isGroqConfigured() || isOpenRouterConfigured();
}

export async function callGroqStructured<T>(params: {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  preferredModel?: string;
  temperature?: number;
}): Promise<{ data: T; modelUsed: string; isFallback: boolean }> {
  const groqClient = getGroqClient();
  const openRouterClient = getOpenRouterClient();

  if (!groqClient && !openRouterClient) {
    throw new Error('Neither GROQ_API_KEY nor OPENROUTER_API_KEY is configured in process.env');
  }

  console.log('[VikaasAI GroqClient] Provider status - Groq:', !!groqClient, 'OpenRouter:', !!openRouterClient);

  let lastError: Error | null = null;

  // Try Groq first if available
  if (groqClient) {
    try {
      console.log('[VikaasAI GroqClient] Attempting Groq API call...');
      const primaryModel = params.preferredModel || MODEL_CONFIG.GROQ_HEAVY;
      const isLightweight = primaryModel === MODEL_CONFIG.GROQ_LIGHT;
      const fallbackModel = isLightweight ? MODEL_CONFIG.GROQ_FALLBACK_LIGHT : MODEL_CONFIG.GROQ_FALLBACK_HEAVY;

      const rawResult = await executeGroqCall(groqClient, primaryModel, params.systemPrompt, params.userPrompt, params.temperature);
      const parsed = parseAndValidate(rawResult, params.schema);
      return { data: parsed, modelUsed: primaryModel, isFallback: false };
    } catch (groqError: any) {
      lastError = groqError;
      console.warn(`[VikaasAI GroqClient] Groq failed: ${groqError.message}. Trying fallback model...`);

      try {
        const fallbackModel = MODEL_CONFIG.GROQ_FALLBACK_HEAVY;
        const fallbackResult = await executeGroqCall(groqClient, fallbackModel, params.systemPrompt, params.userPrompt, params.temperature);
        const parsed = parseAndValidate(fallbackResult, params.schema);
        return { data: parsed, modelUsed: fallbackModel, isFallback: true };
      } catch (groqFallbackError: any) {
        lastError = groqFallbackError;
        console.warn(`[VikaasAI GroqClient] Groq fallback also failed: ${groqFallbackError.message}. Switching to OpenRouter...`);
      }
    }
  }

  // Fallback to OpenRouter
  if (openRouterClient) {
    try {
      console.log('[VikaasAI GroqClient] Attempting OpenRouter API call...');
      const primaryModel = MODEL_CONFIG.OPENROUTER_HEAVY;

      const rawResult = await executeOpenRouterCall(openRouterClient, primaryModel, params.systemPrompt, params.userPrompt, params.temperature);
      const parsed = parseAndValidate(rawResult, params.schema);
      return { data: parsed, modelUsed: primaryModel, isFallback: true };
    } catch (orError: any) {
      lastError = orError;
      console.warn(`[VikaasAI GroqClient] OpenRouter failed: ${orError.message}. Trying fallback model...`);

      try {
        const fallbackModel = MODEL_CONFIG.OPENROUTER_FALLBACK;
        const fallbackResult = await executeOpenRouterCall(openRouterClient, fallbackModel, params.systemPrompt, params.userPrompt, params.temperature);
        const parsed = parseAndValidate(fallbackResult, params.schema);
        return { data: parsed, modelUsed: fallbackModel, isFallback: true };
      } catch (orFallbackError: any) {
        lastError = orFallbackError;
        console.error(`[VikaasAI GroqClient] All providers failed. Last error: ${orFallbackError.message}`);
        throw new Error(`All AI providers failed. Last error: ${orFallbackError.message}`);
      }
    }
  }

  throw new Error(`No AI provider available. Last error: ${lastError?.message || 'unknown'}`);
}

async function executeGroqCall(
  client: Groq,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2
): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`Empty response returned from model ${model}`);
  }
  return content;
}

async function executeOpenRouterCall(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2
): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`Empty response returned from model ${model}`);
  }
  return content;
}

function parseAndValidate<T>(rawJson: string, schema: z.ZodSchema<T>): T {
  let cleaned = rawJson.trim();
  // Strip markdown code fences if model returned them
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
  }

  const jsonObject = JSON.parse(cleaned);
  return schema.parse(jsonObject);
}
