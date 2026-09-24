/**
 * GroundTruth - Groq AI Inference Client
 * Handles structured JSON completion with model fallbacks and schema validation.
 */
import Groq from 'groq-sdk';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

export const MODEL_CONFIG = {
  HEAVY: process.env.GROQ_HEAVY_MODEL || 'openai/gpt-oss-120b',
  LIGHT: process.env.GROQ_LIGHT_MODEL || 'openai/gpt-oss-20b',
  FALLBACK_HEAVY: 'qwen/qwen3.8-27b',
  FALLBACK_LIGHT: 'openai/gpt-oss-20b',
};

let groqInstance: Groq | null = null;

export function getGroqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() || '';
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

export function isGroqConfigured(): boolean {
  const key = getGroqApiKey();
  return Boolean(key && key.length > 10);
}

export async function callGroqStructured<T>(params: {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  preferredModel?: string;
  temperature?: number;
}): Promise<{ data: T; modelUsed: string; isFallback: boolean }> {
  const client = getGroqClient();
  if (!client) {
    throw new Error('GROQ_API_KEY is not configured in process.env');
  }

  const primaryModel = params.preferredModel || MODEL_CONFIG.HEAVY;
  const isLightweight = primaryModel === MODEL_CONFIG.LIGHT;
  const fallbackModel = isLightweight ? MODEL_CONFIG.FALLBACK_LIGHT : MODEL_CONFIG.FALLBACK_HEAVY;

  // Attempt with primary model
  try {
    const rawResult = await executeGroqCall(client, primaryModel, params.systemPrompt, params.userPrompt, params.temperature);
    const parsed = parseAndValidate(rawResult, params.schema);
    return { data: parsed, modelUsed: primaryModel, isFallback: false };
  } catch (primaryError: any) {
    console.warn(`[GroqClient] Primary model (${primaryModel}) call failed: ${primaryError.message}. Attempting fallback to ${fallbackModel}...`);
    
    // Attempt with fallback model
    try {
      const fallbackResult = await executeGroqCall(client, fallbackModel, params.systemPrompt, params.userPrompt, params.temperature);
      const parsed = parseAndValidate(fallbackResult, params.schema);
      return { data: parsed, modelUsed: fallbackModel, isFallback: true };
    } catch (fallbackError: any) {
      // One retry with structured correction
      console.warn(`[GroqClient] Attempting one correction retry with fallback model...`);
      const correctionPrompt = `${params.userPrompt}\n\nIMPORTANT: Return ONLY valid JSON conforming to the requested schema. Ensure all fields are present and properly escaped.`;
      const retryResult = await executeGroqCall(client, fallbackModel, params.systemPrompt, correctionPrompt, 0.2);
      const parsed = parseAndValidate(retryResult, params.schema);
      return { data: parsed, modelUsed: fallbackModel, isFallback: true };
    }
  }
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
