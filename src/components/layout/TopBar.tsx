/**
 * GroundTruth - Top Navigation Bar
 * Conforms strictly to the 3-zone Top Bar Contract:
 * [Zone 1: Single text element wordmark/breadcrumb] - [Zone 2: 4-6 clean single-line nav tabs] - [Zone 3: 1-2 primary actions]
 */
import React from 'react';
import { 
  Network, 
  LayoutDashboard, 
  Activity, 
  FileText, 
  Scale, 
  Globe,
  Download,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export type ActiveTab = 'graph' | 'dashboard' | 'feed' | 'provenance' | 'compare' | 'sources' | 'timeline';

interface TopBarProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  isDemoMode: boolean;
  hasResults: boolean;
  onExportCsv?: () => void;
}

export function TopBar({ activeTab, onChangeTab, isDemoMode, hasResults, onExportCsv }: TopBarProps) {
  return (
    <header className="h-14 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0 select-none">
      {/* Zone 1: Single Wordmark / Breadcrumb */}
      <div className="flex items-center gap-2">
        <a href="/" className="text-sm font-bold tracking-tight text-neutral-100 hover:text-cyan-400 transition-colors">
          GroundTruth
        </a>
        <span className="text-neutral-600">/</span>
        <span className="text-xs text-neutral-400 font-mono">
          {activeTab === 'graph' && 'Research Arena'}
          {activeTab === 'dashboard' && 'Evidence Dashboard'}
          {activeTab === 'feed' && 'Agent Stream Feed'}
          {activeTab === 'provenance' && 'Evidentiary Provenance'}
          {activeTab === 'compare' && 'Agent Reconciliation'}
          {activeTab === 'sources' && 'Web Crawl Index'}
          {activeTab === 'timeline' && 'Audit Timeline'}
        </span>
      </div>

      {/* Zone 2: 4-6 Clean Text / Segmented Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-neutral-900/80 p-1 rounded-lg border border-neutral-800/80">
        <button
          onClick={() => onChangeTab('graph')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'graph' 
              ? 'bg-neutral-800 text-cyan-300 shadow-sm' 
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Arena Graph</span>
        </button>

        <button
          onClick={() => onChangeTab('dashboard')}
          disabled={!hasResults}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'dashboard' 
              ? 'bg-neutral-800 text-cyan-300 shadow-sm' 
              : hasResults ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600 cursor-not-allowed'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => onChangeTab('feed')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'feed' 
              ? 'bg-neutral-800 text-cyan-300 shadow-sm' 
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Activity</span>
        </button>

        <button
          onClick={() => onChangeTab('compare')}
          disabled={!hasResults}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'compare' 
              ? 'bg-neutral-800 text-cyan-300 shadow-sm' 
              : hasResults ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600 cursor-not-allowed'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Compare Agents</span>
        </button>

        <button
          onClick={() => onChangeTab('provenance')}
          disabled={!hasResults}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'provenance' 
              ? 'bg-neutral-800 text-cyan-300 shadow-sm' 
              : hasResults ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600 cursor-not-allowed'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Provenance</span>
        </button>

        <button
          onClick={() => onChangeTab('sources')}
          disabled={!hasResults}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'sources' 
              ? 'bg-neutral-800 text-cyan-300 shadow-sm' 
              : hasResults ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600 cursor-not-allowed'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Sources</span>
        </button>
      </nav>

      {/* Zone 3: 1-2 Primary Actions & Environment Badge */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-[10px] font-mono">
          <div className={`w-2 h-2 rounded-full ${isDemoMode ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} />
          <span className={isDemoMode ? 'text-amber-300' : 'text-emerald-300'}>
            {isDemoMode ? 'SHOWCASE MODE' : 'LIVE GROQ ENGINE'}
          </span>
        </div>

        {hasResults && onExportCsv && (
          <button
            onClick={onExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-200 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span className="whitespace-nowrap">Export</span>
          </button>
        )}
      </div>
    </header>
  );
}
