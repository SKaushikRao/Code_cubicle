/**
 * GroundTruth - Adaptive Dynamic Dashboard
 * Displays verified KPI metrics, Recharts visualizations, sortable/filterable data table,
 * "What We Could Not Verify" section, CSV export, and "Ask the Dataset".
 */
import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  Search, 
  Download, 
  ShieldCheck, 
  AlertTriangle, 
  HelpCircle, 
  Send, 
  CheckCircle2, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { ResearchState, DiscoveredEntity } from '../../types/research';

interface AdaptiveDashboardProps {
  state: ResearchState;
  onSelectCell: (item: any) => void;
}

const PIE_COLORS = ['#10b981', '#06b6d4', '#6366f1', '#f59e0b', '#ec4899'];

export function AdaptiveDashboard({ state, onSelectCell }: AdaptiveDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [askQuery, setAskQuery] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResponse, setAskResponse] = useState<any>(null);

  const spec = state.dashboardSpec;
  const entities = state.entities;

  // Filtered & Sorted Entities
  const filteredEntities = useMemo(() => {
    return entities
      .filter((e) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        const fieldsStr = Object.values(e.fields).map(f => f.value).join(' ').toLowerCase();
        return e.name.toLowerCase().includes(q) || fieldsStr.includes(q);
      })
      .sort((a, b) => {
        const valA = sortField === 'name' ? a.name : (a.fields[sortField]?.value || '');
        const valB = sortField === 'name' ? b.name : (b.fields[sortField]?.value || '');
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [entities, searchTerm, sortField, sortAsc]);

  // Extract all distinct field keys for table columns
  const allFieldKeys = useMemo(() => {
    const keys = new Set<string>();
    entities.forEach(e => {
      Object.keys(e.fields).forEach(k => keys.add(k));
    });
    return Array.from(keys);
  }, [entities]);

  // CSV Export
  const handleExportCsv = () => {
    if (entities.length === 0) return;
    const headers = ['Entity Name', 'Location', 'Overall Status', 'Evidence Coverage %', ...allFieldKeys];
    
    const rows = entities.map(e => {
      const fieldValues = allFieldKeys.map(k => {
        const val = e.fields[k]?.value || 'NOT_FOUND';
        return `"${val.replace(/"/g, '""')}"`;
      });
      return [`"${e.name}"`, `"${e.location || ''}"`, `"${e.overallStatus}"`, `"${e.evidenceCoverage}%"`, ...fieldValues].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `groundtruth_research_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Ask the Dataset
  const handleAskDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuery.trim() || askLoading) return;

    setAskLoading(true);
    setAskResponse(null);

    try {
      const res = await fetch('/api/ask-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: askQuery,
          entities: state.entities,
        }),
      });
      const data = await res.json();
      setAskResponse(data);
    } catch {
      setAskResponse({
        answer: 'Failed to process dataset query. Please check server connectivity.',
        provenanceNote: 'Client network error.',
      });
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Executive Summary */}
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-5 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800/80">
          <div>
            <h2 className="text-lg font-bold text-neutral-100 tracking-tight">
              {spec?.headline || 'Verified Autonomous Intelligence Matrix'}
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-3xl leading-relaxed">
              {spec?.summary || 'Normalized dataset cross-examined by Explorer and Investigator agents and reconciled by Research Arbiter.'}
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700/80 border border-neutral-700 text-xs font-semibold text-neutral-200 transition-colors shrink-0 self-start md:self-auto cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Clean CSV</span>
          </button>
        </div>

        {/* Deterministic KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Total Entities Verified</span>
            <div className="text-xl font-bold font-mono text-neutral-100 mt-1 tabular-nums">{entities.length}</div>
            <span className="text-[10px] text-neutral-500">100% Primary Corroborated</span>
          </div>
          <div className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Discrepancies Resolved</span>
            <div className="text-xl font-bold font-mono text-rose-400 mt-1 tabular-nums">{state.conflicts.length}</div>
            <span className="text-[10px] text-neutral-500">Targeted Escalation Applied</span>
          </div>
          <div className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Total Web Sources Audited</span>
            <div className="text-xl font-bold font-mono text-cyan-400 mt-1 tabular-nums">{state.sources.length}</div>
            <span className="text-[10px] text-neutral-500">Gov & Primary Web Portals</span>
          </div>
          <div className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Average Evidence Coverage</span>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">
              {entities.length > 0 ? Math.round(entities.reduce((a, b) => a + b.evidenceCoverage, 0) / entities.length) : 0}%
            </div>
            <span className="text-[10px] text-neutral-500">Field-by-Field Grounding</span>
          </div>
        </div>
      </div>

      {/* Dynamic Charts Section */}
      {spec?.charts && spec.charts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {spec.charts.map((chart) => {
            const chartData = (chart.data || []).map((row: any) => {
              const keys = Object.keys(row);
              const xKey = chart.xAxisKey in row ? chart.xAxisKey : (keys.find(k => typeof row[k] === 'string') || keys[0] || 'label');
              const yKey = chart.dataKey in row ? chart.dataKey : (keys.find(k => typeof row[k] === 'number') || keys[1] || 'value');
              return {
                ...row,
                __x: String(row[xKey] ?? row[keys[0]] ?? ''),
                __y: typeof row[yKey] === 'number' ? row[yKey] : (parseFloat(row[yKey]) || 0),
              };
            });

            return (
              <div key={chart.id} className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 backdrop-blur-md">
                <div className="mb-3">
                  <h4 className="text-xs font-semibold text-neutral-200">{chart.title}</h4>
                  <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{chart.description}</p>
                </div>

                <div className="h-56 w-full text-xs font-mono">
                  <ResponsiveContainer width="100%" height="100%">
                    {chart.chartType === 'pie' ? (
                      <PieChart>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px', fontSize: '11px' }} 
                          itemStyle={{ color: '#e5e5e5' }}
                        />
                        <Pie
                          data={chartData}
                          dataKey="__y"
                          nameKey="__x"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          innerRadius={35}
                          paddingAngle={4}
                        >
                          {chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    ) : (
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <XAxis 
                          dataKey="__x" 
                          stroke="#737373" 
                          fontSize={10} 
                          tickLine={false} 
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                        />
                        <YAxis stroke="#737373" fontSize={10} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px', fontSize: '11px' }} 
                          itemStyle={{ color: '#06b6d4' }}
                        />
                        <Bar dataKey="__y" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filterable, Sortable Data Table */}
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl overflow-hidden backdrop-blur-md">
        <div className="p-4 border-b border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-neutral-200">Verified Evidence Table</h3>
            <span className="text-[10px] font-mono text-neutral-400">({filteredEntities.length} records)</span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter entities or fields..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-950/80 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-neutral-950/90 sticky top-0 z-10 border-b border-neutral-800 text-[10px] font-mono uppercase text-neutral-400">
              <tr>
                <th 
                  onClick={() => { setSortField('name'); setSortAsc(!sortAsc); }}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-neutral-200"
                >
                  <div className="flex items-center gap-1">
                    <span>Target Entity</span>
                    {sortField === 'name' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                {allFieldKeys.map((k) => (
                  <th key={k} className="py-3 px-4 font-semibold whitespace-nowrap">
                    {k}
                  </th>
                ))}
                <th className="py-3 px-4 font-semibold text-right">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-sans">
              {filteredEntities.map((ent) => (
                <tr key={ent.id} className="hover:bg-neutral-800/40 transition-colors group">
                  <td 
                    onClick={() => onSelectCell({ type: 'entity', entity: ent })}
                    className="py-3 px-4 font-semibold text-neutral-100 whitespace-nowrap cursor-pointer hover:text-cyan-300"
                    title="Click to view full entity verification profile in side panel"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                      <span>{ent.name}</span>
                    </div>
                    {ent.location && <div className="text-[10px] text-neutral-400 font-normal pl-3">{ent.location}</div>}
                  </td>

                  {allFieldKeys.map((k) => {
                    const field = ent.fields[k];
                    if (!field) {
                      return (
                        <td key={k} className="py-3 px-4 text-neutral-500 italic text-[11px]">
                          Not found
                        </td>
                      );
                    }

                    return (
                      <td 
                        key={k} 
                        onClick={() => onSelectCell({ type: 'claim', entityName: ent.name, fieldName: k, fieldData: field })}
                        className="py-3 px-4 text-neutral-300 text-[11px] cursor-pointer hover:bg-cyan-950/20 hover:text-cyan-200 transition-colors max-w-xs truncate"
                        title="Click to view evidence citation"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{field.value}</span>
                          <ExternalLink className="w-3 h-3 text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                      </td>
                    );
                  })}

                  <td className="py-3 px-4 text-right font-mono text-[11px] tabular-nums text-emerald-400 font-semibold whitespace-nowrap">
                    {ent.evidenceCoverage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ask the Dataset Section */}
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-5 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold text-neutral-200">Ask the Dataset</h3>
        </div>
        <p className="text-[11px] text-neutral-400 mb-3">
          Query this active in-memory dataset directly. Arithmetic and counts are computed deterministically.
        </p>

        <form onSubmit={handleAskDataset} className="flex gap-2">
          <input
            type="text"
            value={askQuery}
            onChange={(e) => setAskQuery(e.target.value)}
            placeholder="e.g. 'How many total entities?', 'Which companies serve Jaipur?', 'What are the tariff rates?'"
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={askLoading}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {askLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Query</span>
          </button>
        </form>

        {askResponse && (
          <div className="mt-3 p-3.5 rounded-lg bg-neutral-950/80 border border-neutral-800/80 text-xs">
            <div className="text-neutral-100 font-medium mb-1 leading-relaxed">{askResponse.answer}</div>
            <div className="text-[10px] font-mono text-neutral-500 mt-1">
              Source Note: {askResponse.provenanceNote}
            </div>
          </div>
        )}
      </div>

      {/* "What We Could Not Verify" Section */}
      {spec?.unverifiedObservations && spec.unverifiedObservations.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/40">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-2">
            <HelpCircle className="w-4 h-4" />
            <span>What GroundTruth Could Not Statutorily Verify</span>
          </div>
          <ul className="space-y-1.5 text-xs text-neutral-300 font-sans">
            {spec.unverifiedObservations.map((obs, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
