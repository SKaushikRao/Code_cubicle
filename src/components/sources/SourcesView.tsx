/**
 * GroundTruth - Sources Directory View
 * Comprehensive index of all discovered web sources with authority ratings and scraped word counts.
 */
import React, { useState } from 'react';
import { Globe, Search, ExternalLink, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { DiscoveredSource, SourceAuthority } from '../../types/research';

interface SourcesViewProps {
  sources: DiscoveredSource[];
  onSelectSource: (source: DiscoveredSource) => void;
}

export function SourcesView({ sources, onSelectSource }: SourcesViewProps) {
  const [filterDomain, setFilterDomain] = useState('');

  const filtered = sources.filter(s => 
    !filterDomain || s.domain.toLowerCase().includes(filterDomain.toLowerCase()) || s.title.toLowerCase().includes(filterDomain.toLowerCase())
  );

  const getAuthorityBadge = (auth: SourceAuthority) => {
    switch (auth) {
      case 'OFFICIAL_GOV':
        return <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded">Gov / Statutory</span>;
      case 'PRIMARY_COMPANY':
        return <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded">Primary Company</span>;
      case 'ACADEMIC_INDUSTRY':
        return <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/70 border border-indigo-800/60 px-2 py-0.5 rounded">Academic</span>;
      case 'SECONDARY_MEDIA':
        return <span className="text-[10px] font-mono text-amber-400 bg-amber-950/70 border border-amber-800/60 px-2 py-0.5 rounded">Secondary Press</span>;
      default:
        return <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded">Directory</span>;
    }
  };

  return (
    <div className="space-y-4 pb-12">
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-5 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <span>Discovered Web Sources & Scraping Index</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Every web domain discovered, crawled, and parsed during the investigation with authority classifications.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search domain or title..."
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
            className="w-full bg-neutral-950/80 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((src) => (
          <div
            key={src.id}
            onClick={() => onSelectSource(src)}
            className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 hover:border-cyan-500/50 cursor-pointer transition-all group backdrop-blur-md"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-xs font-mono font-semibold text-neutral-200 group-hover:text-cyan-300 transition-colors">
                  {src.domain}
                </span>
              </div>
              {getAuthorityBadge(src.authority)}
            </div>

            <div className="text-xs font-medium text-neutral-200 line-clamp-1 mb-2">
              {src.title}
            </div>

            <p className="text-[11px] text-neutral-400 line-clamp-2 italic mb-3 font-serif">
              "{src.snippet}"
            </p>

            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 pt-2 border-t border-neutral-800/80">
              <span className="uppercase">Agent: {src.discoveredBy}</span>
              <span className="flex items-center gap-1 text-cyan-400 group-hover:underline">
                Inspect Source <ExternalLink className="w-3 h-3" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
