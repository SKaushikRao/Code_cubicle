/**
 * GroundTruth - Full-Stack Express Server with Vite Middleware
 * Runs on Port 3000 as required by the runtime environment.
 * Exposes SSE streaming endpoints for real-time agent execution without exposing API keys.
 */
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ResearchOrchestrator } from './src/services/orchestrator';
import { isGroqConfigured, MODEL_CONFIG, callGroqStructured } from './src/services/groqClient';
import { AskDatasetResponseSchema } from './src/services/schemas';
import { SystemStatus } from './src/types/research';

// Load local environment files
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '2mb' }));

// In-memory active research sessions
const activeSessions = new Map<string, ResearchOrchestrator>();

// 1. System Status Endpoint
app.get('/api/system/status', (req: Request, res: Response) => {
  const configured = isGroqConfigured();
  const status: SystemStatus = {
    groqConfigured: configured,
    groqModel: configured ? `${MODEL_CONFIG.HEAVY} (Primary) / ${MODEL_CONFIG.LIGHT} (Planner)` : 'Ready (Awaiting GROQ_API_KEY)',
    searchEngine: 'Live Web Scraping & Multi-Engine Crawler',
    scraperActive: true,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  };
  res.json(status);
});

// 2. Real-Time Research Execution SSE Stream
app.get('/api/research/stream', async (req: Request, res: Response) => {
  const query = (req.query.query as string || '').trim();
  const sessionId = (req.query.sessionId as string) || `session-${Date.now()}`;

  if (!query) {
    res.status(400).json({ error: 'Research query is required' });
    return;
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const sendEvent = (eventData: any) => {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
  };

  const orchestrator = new ResearchOrchestrator(sessionId, (evt) => {
    sendEvent({ type: 'event', event: evt });
  });

  activeSessions.set(sessionId, orchestrator);

  req.on('close', () => {
    orchestrator.cancel();
    activeSessions.delete(sessionId);
  });

  try {
    const finalData = await orchestrator.runResearch(query);
    sendEvent({ type: 'final_payload', data: finalData });
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err: any) {
    sendEvent({ type: 'fatal_error', message: err.message || 'Pipeline crashed' });
    res.end();
  } finally {
    activeSessions.delete(sessionId);
  }
});

// 3. Ask the Dataset (Deterministic aggregation + LLM query)
app.post('/api/ask-dataset', async (req: Request, res: Response) => {
  const { question, entities } = req.body;
  if (!question || !Array.isArray(entities)) {
    res.status(400).json({ error: 'question and entities array required' });
    return;
  }

  const qLower = question.toLowerCase();
  
  // Deterministic checks first to eliminate math/count hallucinations
  if (qLower.includes('how many') || qLower.includes('total count')) {
    res.json({
      answer: `There are currently ${entities.length} fully indexed and audited entities in the current session dataset.`,
      highlightEntities: entities.map((e: any) => e.name),
      filteredCount: entities.length,
      provenanceNote: 'Calculated deterministically from in-memory session state.',
    });
    return;
  }

  if (isGroqConfigured()) {
    try {
      const askPrompt = `You are GroundTruth Dataset Query Interpreter.
Answer the user's question using ONLY the provided verified entities.
Never hallucinate entities or fields not present in the data.
Be concise, accurate, and specify exactly which source corroborates it.`;

      const userContent = `Question: "${question}"
Dataset Entities: ${JSON.stringify(entities.slice(0, 15))}`;

      const { data } = await callGroqStructured({
        systemPrompt: askPrompt,
        userPrompt: userContent,
        schema: AskDatasetResponseSchema,
        preferredModel: MODEL_CONFIG.LIGHT,
      });

      res.json(data);
      return;
    } catch {
      // fallback to clean deterministic search below
    }
  }

  // Graceful deterministic search over entity fields
  const matches = entities.filter((e: any) => {
    const searchString = (e.name + ' ' + JSON.stringify(e.fields)).toLowerCase();
    return qLower.split(' ').some((word: string) => word.length > 2 && searchString.includes(word));
  });

  res.json({
    answer: matches.length > 0 
      ? `Found ${matches.length} matching entities matching "${question}": ${matches.map((m: any) => m.name).join(', ')}.`
      : `No direct matches found in current dataset for "${question}". Try querying for specific cities, tariffs, or model names.`,
    highlightEntities: matches.map((m: any) => m.name),
    filteredCount: matches.length,
    provenanceNote: 'Computed via deterministic client-session filtering.',
  });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[GroundTruth Engine] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[GroundTruth Engine] Server start failure:', err);
});
