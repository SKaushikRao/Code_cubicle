/**
 * GroundTruth - "Compare Agents" Side-by-Side View
 * Visual comparison of Explorer discoveries vs Investigator findings with diff highlighting.
 */
import React from 'react';
import { 
  Search, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Scale,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { ResearchState } from '../../types/research';

interface CompareAgentsViewProps {
  state: ResearchState;
  onSelectConflict: (conflict: any) => void;
}

export function CompareAgentsView({ state, onSelectConflict }: CompareAgentsViewProps) {
  const explorerClaims = state.claims.filter(c => c.discoveredBy === 'explorer');
  const investigatorClaims = state.claims.filter(c => c.discoveredBy === 'investigator');

  return (
    <div className="space-y-5 pb-12">
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-5 backdrop-blur-md">
        <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
          <Scale className="w-5 h-5 text-amber-400" />
          <span>Independent Agent Comparison & Claim Reconciliation</span>
        </h2>
        <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
          Inspect raw claims discovered by Explorer alongside adversarial cross-verifications by Investigator.
          Green highlights indicate consensus; red/amber indicates disagreements escalated to the Research Arbiter.
        </p>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-neutral-800/80 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-emerald-500/30 border border-emerald-500" />
            <span className="text-neutral-300">Consensus Match</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-rose-500/30 border border-rose-500" />
            <span className="text-neutral-300">Disagreement / Conflict</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-cyan-500/30 border border-cyan-500" />
            <span className="text-neutral-300">Explorer Unique</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-indigo-500/30 border border-indigo-500" />
            <span className="text-neutral-300">Investigator Primary</span>
          </div>
        </div>
      </div>

      {/* Discrepancies Focus Card */}
      {state.conflicts.length > 0 && (
        <div className="bg-neutral-900/60 border border-rose-900/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs mb-3">
            <AlertTriangle className="w-4 h-4" />
            <span>Audited Discrepancies ({state.conflicts.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.conflicts.map((cfl) => (
              <div
                key={cfl.id}
                onClick={() => onSelectConflict(cfl)}
                className="p-3 rounded-lg bg-neutral-950/80 border border-neutral-800 hover:border-rose-500/60 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 mb-1.5">
                  <span className="text-neutral-200 font-semibold">{cfl.entityName}</span>
                  <span className="text-rose-400">{cfl.fieldName}</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start justify-between text-cyan-300 bg-cyan-950/20 p-1.5 rounded">
                    <span className="text-[10px] font-mono text-cyan-500 uppercase">Explorer:</span>
                    <span className="text-right truncate ml-2">{cfl.explorerClaim.value}</span>
                  </div>
                  <div className="flex items-start justify-between text-indigo-300 bg-indigo-950/20 p-1.5 rounded">
                    <span className="text-[10px] font-mono text-indigo-500 uppercase">Investigator:</span>
                    <span className="text-right truncate ml-2">{cfl.investigatorClaim.value}</span>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-amber-300 flex items-center justify-between pt-1 border-t border-neutral-800/80">
                  <span className="font-mono">Arbiter: {cfl.arbiterDecision || 'ESCALATED'}</span>
                  <span className="group-hover:translate-x-0.5 transition-transform text-neutral-400">View Evidence →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two Column Side-by-Side Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Explorer Column */}
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-cyan-900/40">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-cyan-950 text-cyan-400">
                <Search className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-semibold text-neutral-200">Explorer Agent Findings</h3>
            </div>
            <span className="text-[10px] font-mono text-cyan-400">{explorerClaims.length} Claims Discovered</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {explorerClaims.map((claim) => (
              <div 
                key={claim.id} 
                className="p-2.5 rounded-lg bg-neutral-950/80 border border-neutral-800/80 text-xs"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 mb-1">
                  <span className="text-neutral-200 font-semibold">{claim.entityName}</span>
                  <span className="text-cyan-400">{claim.fieldName}</span>
                </div>
                <div className="text-neutral-100 font-medium mb-1">{claim.value}</div>
                <div className="text-[10px] text-neutral-500 truncate font-mono">
                  {claim.sourceTitle}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Investigator Column */}
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-indigo-900/40">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-indigo-950 text-indigo-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-semibold text-neutral-200">Investigator Agent Verifications</h3>
            </div>
            <span className="text-[10px] font-mono text-indigo-400">{investigatorClaims.length} Primary Checks</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {investigatorClaims.map((claim) => (
              <div 
                key={claim.id} 
                className="p-2.5 rounded-lg bg-neutral-950/80 border border-neutral-800/80 text-xs"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 mb-1">
                  <span className="text-neutral-200 font-semibold">{claim.entityName}</span>
                  <span className="text-indigo-400">{claim.fieldName}</span>
                </div>
                <div className="text-neutral-100 font-medium mb-1">{claim.value}</div>
                <div className="text-[10px] text-neutral-500 truncate font-mono">
                  {claim.sourceTitle}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
