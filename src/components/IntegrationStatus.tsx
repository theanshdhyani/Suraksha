import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import type { IntegrationStatusItem, ServiceMode } from '../core/types';

export function IntegrationStatus() {
  const [items, setItems] = useState<IntegrationStatusItem[]>([]);
  const [probing, setProbing] = useState(false);

  const loadStatuses = async (probe = false) => {
    setProbing(true);
    try {
      const res = await api.getIntegrations(probe);
      setItems(res.integrations);
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    void loadStatuses(false);
  }, []);

  const toggleMode = async (id: string, nextMode: ServiceMode) => {
    setProbing(true);
    try {
      const res = await api.setIntegrationMode(id, nextMode);
      setItems(res.integrations);
    } finally {
      setProbing(false);
    }
  };

  const statusColor = (status: IntegrationStatusItem['status']) => {
    if (status === 'LIVE') return 'text-emerald-700';
    if (status === 'MOCK') return 'text-blue-700';
    if (status === 'PENDING CONFIGURATION') return 'text-amber-700';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Integration Status</h1>
          <p className="text-xs text-slate-500 mt-1">
            Independent per-service adapter health and MOCK / LIVE switching without altering
            application logic
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadStatuses(true)}
          disabled={probing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-60 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
          <span>{probing ? 'Running Health Probes…' : 'Run Live Health Checks'}</span>
        </button>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-3 px-4 font-semibold">Service / Adapter</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Health Status</th>
                <th className="py-3 px-4 font-semibold">Required Env Vars</th>
                <th className="py-3 px-4 font-semibold">Adapter Mode</th>
                <th className="py-3 px-4 font-semibold">Diagnostic Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-4 font-semibold text-slate-900">{item.name}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-500">{item.category}</td>
                  <td className={`py-3.5 px-4 font-mono font-semibold ${statusColor(item.status)}`}>
                    {item.status}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600">
                    {item.required_env.map((envName) => {
                      const present = item.configured_env.includes(envName);
                      return (
                        <div key={envName} className={present ? 'text-emerald-700' : 'text-slate-500'}>
                          {present ? '✓' : '○'} {envName}
                        </div>
                      );
                    })}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
                      <button
                        type="button"
                        onClick={() => toggleMode(item.id, 'MOCK')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          item.configured_mode === 'MOCK'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        MOCK
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMode(item.id, 'LIVE')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          item.configured_mode === 'LIVE'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        LIVE
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 max-w-xs">{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
