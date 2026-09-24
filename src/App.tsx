/**
 * GroundTruth - "The web, queried like a database."
 * Problem Statement: Code Cubicle 6.0: "AI-Powered Intelligence for the Real World"
 * Core Promise: "Two agents investigate. One arbiter verifies. GroundTruth shows you how it knows."
 */
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Send, 
  RotateCcw, 
  Sparkles, 
  AlertCircle, 
  SlidersHorizontal, 
  PanelRightClose, 
  PanelRightOpen,
  ArrowRight,
  ShieldCheck,
  Compass,
  Cpu,
  Layers
} from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar, ActiveTab } from './components/layout/TopBar';
import { CounterBar } from './components/arena/CounterBar';
import { PlanDisplay } from './components/arena/PlanDisplay';
import { ResearchGraph } from './components/graph/ResearchGraph';
import { ActivityFeed } from './components/arena/ActivityFeed';
import { AdaptiveDashboard } from './components/dashboard/AdaptiveDashboard';
import { ProvenanceView } from './components/provenance/ProvenanceView';
import { CompareAgentsView } from './components/compare/CompareAgentsView';
import { SourcesView } from './components/sources/SourcesView';
import { ResearchTimeline } from './components/timeline/ResearchTimeline';
import { EvidenceInspector } from './components/inspector/EvidenceInspector';
import { ResearchState, ResearchEvent, SystemStatus } from './types/research';

const INITIAL_STATE: ResearchState = {
  sessionId: `session-${Date.now()}`,
  query: '',
  status: 'idle',
  isDemoMode: false,
  plan: null,
  sources: [],
  entities: [],
  claims: [],
  conflicts: [],
  dashboardSpec: null,
  events: [],
  stats: {
    sourcesCount: 0,
    pagesScraped: 0,
    entitiesCount: 0,
    claimsCount: 0,
    verifiedCount: 0,
    conflictsCount: 0,
    missingCount: 0,
    evidenceCoverage: 0,
  },
};

export default function App() {
  const [state, setState] = useState<ResearchState>(INITIAL_STATE);
  const [inputQuery, setInputQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('graph');
  const [selectedInspectorItem, setSelectedInspectorItem] = useState<any>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [recentSessions, setRecentSessions] = useState<Array<{ id: string; query: string; timestamp: string }>>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial system status
  useEffect(() => {
    fetch('/api/system/status')
      .then(res => res.json())
      .then(data => setSystemStatus(data))
      .catch(err => console.warn('Could not fetch system status:', err));
  }, []);

  // Handle + New Research: completely resets in-memory React state
  const handleNewResearch = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState({
      ...INITIAL_STATE,
      sessionId: `session-${Date.now()}`,
    });
    setInputQuery('');
    setActiveTab('graph');
    setSelectedInspectorItem(null);
  };

  // Run Research via Server-Sent Events (SSE)
  const handleRunResearch = (queryToRun?: string) => {
    const finalQuery = (queryToRun || inputQuery).trim();
    if (!finalQuery) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const newSessionId = `session-${Date.now()}`;
    const initialEvents: ResearchEvent[] = [
      {
        id: `evt-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'planner_started',
        agent: 'planner',
        message: `Dispatching GroundTruth autonomous research orchestrator for "${finalQuery}"`,
      }
    ];

    setState({
      sessionId: newSessionId,
      query: finalQuery,
      status: 'planning',
      isDemoMode: false,
      plan: null,
      sources: [],
      entities: [],
      claims: [],
      conflicts: [],
      dashboardSpec: null,
      events: initialEvents,
      stats: INITIAL_STATE.stats,
    });

    setInputQuery(finalQuery);
    setActiveTab('graph');

    // Add to in-memory recent sessions
    setRecentSessions(prev => [
      { id: newSessionId, query: finalQuery, timestamp: new Date().toISOString() },
      ...prev.slice(0, 4),
    ]);

    // Connect SSE
    const sseUrl = `/api/research/stream?query=${encodeURIComponent(finalQuery)}&sessionId=${newSessionId}`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        es.close();
        setState(prev => ({
          ...prev,
          status: 'completed',
        }));
        return;
      }

      try {
        const payload = JSON.parse(e.data);

        if (payload.type === 'event' && payload.event) {
          const evt: ResearchEvent = payload.event;
          setState(prev => {
            const nextEvents = [...prev.events, evt];
            let nextStatus = prev.status;

            if (evt.type === 'planner_completed' && evt.details?.plan) {
              nextStatus = 'investigating';
              return {
                ...prev,
                plan: evt.details.plan,
                status: nextStatus,
                events: nextEvents,
              };
            }

            if (evt.type === 'source_found' && evt.details?.source) {
              const newSrc = evt.details.source;
              const exists = prev.sources.some(s => s.url === newSrc.url);
              const updatedSources = exists ? prev.sources : [...prev.sources, newSrc];
              return {
                ...prev,
                sources: updatedSources,
                events: nextEvents,
              };
            }

            if (evt.type === 'arbiter_started') {
              nextStatus = 'arbitrating';
            }

            if (evt.type === 'conflict_detected' && evt.details?.conflict) {
              const newCfl = evt.details.conflict;
              const exists = prev.conflicts.some(c => c.id === newCfl.id);
              const updatedConflicts = exists ? prev.conflicts : [...prev.conflicts, newCfl];
              return {
                ...prev,
                conflicts: updatedConflicts,
                events: nextEvents,
              };
            }

            if (evt.type === 'visualizer_started') {
              nextStatus = 'visualizing';
            }

            return {
              ...prev,
              status: nextStatus,
              events: nextEvents,
            };
          });
        } else if (payload.type === 'final_payload' && payload.data) {
          const d = payload.data;
          setState(prev => ({
            ...prev,
            status: 'completed',
            plan: d.plan || prev.plan,
            sources: d.sources || prev.sources,
            entities: d.entities || prev.entities,
            claims: d.claims || prev.claims,
            conflicts: d.conflicts || prev.conflicts,
            dashboardSpec: d.dashboardSpec || prev.dashboardSpec,
            isDemoMode: Boolean(d.isDemoMode),
          }));
          // Automatically switch to dashboard tab and show top entity in inspector panel
          setActiveTab('dashboard');
          if (d.entities && d.entities.length > 0) {
            setSelectedInspectorItem({ type: 'entity', entity: d.entities[0] });
            setInspectorOpen(true);
          }
        } else if (payload.type === 'fatal_error') {
          setState(prev => ({
            ...prev,
            status: 'error',
            errorMessage: payload.message,
          }));
          es.close();
        }
      } catch (err) {
        console.warn('Error parsing SSE event:', err);
      }
    };

    es.onerror = (err) => {
      console.warn('SSE connection ended or interrupted:', err);
      es.close();
      setState(prev => ({
        ...prev,
        status: prev.entities.length > 0 ? 'completed' : 'error',
      }));
    };
  };

  const isResearching = ['planning', 'investigating', 'arbitrating', 'visualizing'].includes(state.status);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 font-sans selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* 1. Left Sidebar */}
      <Sidebar
        onNewResearch={handleNewResearch}
        onSelectPrompt={(p) => {
          setInputQuery(p);
          handleRunResearch(p);
        }}
        systemStatus={systemStatus}
        activeSessionId={state.sessionId}
        recentSessions={recentSessions}
        onSelectSession={(id) => {
          // in-memory session selector
        }}
      />

      {/* Main Workspace Canvas */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Bar Navigation (Zone 1 - Zone 2 - Zone 3) */}
        <TopBar
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          isDemoMode={state.isDemoMode}
          hasResults={state.entities.length > 0}
        />

        {/* Center Arena Scroll View */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Research Input Bar */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3 backdrop-blur-md shadow-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunResearch();
              }}
              className="flex items-center gap-3"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder="Enter any research objective... e.g. 'Find 20 EV charging companies operating in Rajasthan, compare cities served, charger types, pricing and official contact information, verify important claims and flag contradictions'"
                  disabled={isResearching}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-2.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isResearching || !inputQuery.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white text-xs font-semibold shadow-sm transition-all duration-150 shrink-0 cursor-pointer"
              >
                {isResearching ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Investigating Web...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>RUN RESEARCH</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setInspectorOpen(!inspectorOpen)}
                className="p-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700/80 border border-neutral-700 text-neutral-300 transition-colors shrink-0 cursor-pointer"
                title={inspectorOpen ? 'Hide Evidence Inspector' : 'Show Evidence Inspector'}
              >
                {inspectorOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4 text-cyan-400" />}
              </button>
            </form>
          </div>

          {/* Live Counters */}
          <CounterBar state={state} />

          {/* Research Ready Quick Bar */}
          {state.status === 'completed' && state.entities.length > 0 && (
            <div className="bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-neutral-900/60 border border-emerald-800/60 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-900/60 border border-emerald-700/60">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                    <span>Research Audit Complete</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {state.entities.length} Verified Records
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                    {state.sources.length} live web sources audited · {state.conflicts.length} discrepancies resolved
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'dashboard'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  View Matrix Table
                </button>
                <button
                  onClick={() => setActiveTab('graph')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'graph'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  Arena Graph
                </button>
                <button
                  onClick={() => setActiveTab('compare')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'compare'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  Agent Diff
                </button>
                <button
                  onClick={() => setActiveTab('provenance')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'provenance'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  Provenance
                </button>
              </div>
            </div>
          )}

          {/* Initial Welcome & Value Proposition (When Idle) */}
          {state.status === 'idle' && (
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl p-8 backdrop-blur-md text-center max-w-3xl mx-auto my-6 space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(6,182,212,0.3)]">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>

              <div>
                <h2 className="text-xl font-bold tracking-tight text-neutral-100">
                  GroundTruth — “The web, queried like a database.”
                </h2>
                <p className="text-xs text-neutral-400 mt-2 max-w-xl mx-auto leading-relaxed">
                  Describe the data you need. Two independent agents investigate the web. A research arbiter reconciles their evidence. GroundTruth builds the dashboard.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left pt-2">
                <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 space-y-1">
                  <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs font-mono">
                    <span>01. Explorer Agent</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    Broad live web crawler discovering candidate entities, directory listings, and raw sources.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 space-y-1">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs font-mono">
                    <span>02. Investigator Agent</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    Adversarial validator auditing official government gazettes, regulatory orders, and primary portals.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800/80 space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs font-mono">
                    <span>03. Research Arbiter</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    Reconciles conflicting claims, triggers targeted escalation search, and eliminates hallucinations.
                  </p>
                </div>
              </div>

              <div className="pt-2 text-xs text-neutral-400 flex items-center justify-center gap-2">
                <span>Try an inquiry above or select an example from the sidebar.</span>
              </div>
            </div>
          )}

          {/* Research Plan Display (if available) */}
          {state.plan && <PlanDisplay plan={state.plan} />}

          {/* Active View Switching */}
          {activeTab === 'graph' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[620px]">
              <div className="lg:col-span-2 h-full">
                <ResearchGraph
                  state={state}
                  onSelectItem={(item) => {
                    setSelectedInspectorItem(item);
                    setInspectorOpen(true);
                  }}
                />
              </div>
              <div className="lg:col-span-1 h-full">
                <ActivityFeed
                  events={state.events}
                  onSelectEvent={(evt) => {
                    setSelectedInspectorItem({ type: 'event', event: evt });
                    setInspectorOpen(true);
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <AdaptiveDashboard
              state={state}
              onSelectCell={(cellData) => {
                setSelectedInspectorItem(cellData);
                setInspectorOpen(true);
              }}
            />
          )}

          {activeTab === 'feed' && (
            <div className="h-[600px]">
              <ActivityFeed
                events={state.events}
                onSelectEvent={(evt) => {
                  setSelectedInspectorItem({ type: 'event', event: evt });
                  setInspectorOpen(true);
                }}
              />
            </div>
          )}

          {activeTab === 'provenance' && (
            <ProvenanceView
              state={state}
              onSelectEvidence={(evidence) => {
                setSelectedInspectorItem(evidence);
                setInspectorOpen(true);
              }}
            />
          )}

          {activeTab === 'compare' && (
            <CompareAgentsView
              state={state}
              onSelectConflict={(cfl) => {
                setSelectedInspectorItem({ type: 'conflict', conflict: cfl });
                setInspectorOpen(true);
              }}
            />
          )}

          {activeTab === 'sources' && (
            <SourcesView
              sources={state.sources}
              onSelectSource={(src) => {
                setSelectedInspectorItem({ type: 'source', source: src });
                setInspectorOpen(true);
              }}
            />
          )}

          {activeTab === 'timeline' && (
            <ResearchTimeline
              events={state.events}
              onSelectEvent={(evt) => {
                setSelectedInspectorItem({ type: 'event', event: evt });
                setInspectorOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {/* 3. Right Evidence Inspector Panel */}
      {inspectorOpen && (
        <aside className="w-80 h-full bg-neutral-950/95 border-l border-neutral-800/80 flex flex-col shrink-0">
          <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-300">Evidence Inspector</span>
            <button
              onClick={() => setInspectorOpen(false)}
              className="text-neutral-500 hover:text-neutral-300 p-1 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <EvidenceInspector
              selectedItem={selectedInspectorItem}
              onClose={() => setSelectedInspectorItem(null)}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
