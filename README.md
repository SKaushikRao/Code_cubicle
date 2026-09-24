# Vikaas AI — “The web, queried like Never Before”

> Built for the Code Cubicle 6.0 problem statement: **“AI-Powered Intelligence for the Real World.”**
> **Core Promise:** *“Two agents investigate. One arbiter verifies. GroundTruth shows you how it knows.”*

---

## Overview

**GroundTruth** is an autonomous, visually transparent web-intelligence platform. Instead of a conversational chatbot or a static scraper, GroundTruth deploys a multi-agent verification system that transforms live web exploration into a structured, audit-ready database.

When a user submits a natural-language research request:
1. **Research Planner:** Synthesizes a structured specification detailing target entities, geographic bounds, audited fields, dual search strategies, and confidence thresholds.
2. **Parallel Dual-Agent Dispatch:**
   - **Explorer Agent (Discovery Vector):** Maximizes breadth, querying diverse vectors, finding candidate entities and raw company portals.
   - **Investigator Agent (Adversarial Vector):** Autonomously seeks primary sources (state gazettes, regulatory orders, official filings), checking for stale claims and testing pricing accuracy.
3. **Research Arbiter / Judge:** Compares findings field-by-field. Detects discrepancies, initiates **Targeted Web Escalation** when confidence is low, and applies a deterministic evaluation hierarchy:
   $$\text{Official Gov / Statutory} \succ \text{Primary Company Telemetry} \succ \text{Industry Analysis} \succ \text{Aggregator Directories}$$
4. **Adaptive Evidence Dashboard:** Computes deterministic metrics, visualizes data via Recharts, provides a filterable evidence table, includes a transparent *"What We Could Not Verify"* audit, and offers an interactive *"Ask the Dataset"* query engine.

---

## Architectural Highlights

- **Dynamic React Flow Arena Graph (`@xyflow/react`):** Real-time execution graph reflecting nodes for Planner, Explorer, Investigator, Discovered Sources, Conflicts, Targeted Escalation, and the Arbiter Judge.
- **Evidentiary Provenance ("Explain How You Know"):** Full chain-of-custody walkthrough tracking the path from raw prompt to validated record.
- **Agent Comparison Matrix:** Side-by-side claim reconciliation highlighting consensus (green) and conflicting evidence (amber/red).
- **Server-Side Security:** Zero API keys in client-side bundles. Groq model inference and web scraping execute inside a thin server layer with Server-Sent Events (SSE).
- **Strict In-Memory Discipline:** No databases (no SQLite, MongoDB, Firebase, or Redis). Clicking `+ New Research` purges state for a clean session.
- **Graceful Showcase Fallback:** If `GROQ_API_KEY` is not yet configured, GroundTruth operates in an authentic Showcase Mode with verifiable real-world data and real-time streaming, clearly labeled in the UI.

---

## Environment & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional for Live Groq Inference)
Create a `.env.local` file:
```bash
cp .env.local.example .env.local
```
Inside `.env.local`:
```env
GROQ_API_KEY="gsk_your_groq_api_key_here"
```

### 3. Run Development Server
```bash
npm run dev
```
The server will boot on `http://0.0.0.0:3000`.

---

## Tech Stack
- **Framework:** React 19 + TypeScript + Vite + Express (Port 3000 full-stack architecture)
- **AI Inference Engine:** Groq SDK (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, fallback `llama-3.3-70b-versatile`)
- **Interactive Workflow Graph:** `@xyflow/react` (React Flow)
- **Data Visualization:** Recharts
- **HTML Parsing & Web Scraping:** Cheerio
- **Validation:** Zod schemas
- **Styling:** Tailwind CSS v4 (Dark intelligence console theme)
- **Icons:** Lucide React
