import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  FileCheck2,
  GraduationCap,
  Home,
  Menu,
  Network,
  PhoneIncoming,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { api, type DashboardSummary } from './api/client';
import { ArchitectureMonitor } from './components/ArchitectureMonitor';
import { EvidenceCenter } from './components/EvidenceCenter';
import { GuardianDashboard } from './components/GuardianDashboard';
import { IntegrationStatus } from './components/IntegrationStatus';
import { LiveGuard } from './components/LiveGuard';
import { type NavPage, ProtectionDashboard } from './components/ProtectionDashboard';
import { ScamDrill } from './components/ScamDrill';

const NAV_ITEMS: Array<{
  id: NavPage;
  label: string;
  icon: typeof Home;
}> = [
  { id: 'home', label: 'Protection Home', icon: Home },
  { id: 'live-guard', label: 'Live Guard', icon: PhoneIncoming },
  { id: 'guardian', label: 'Guardian Dashboard', icon: Users },
  { id: 'architecture', label: 'Architecture Monitor', icon: Network },
  { id: 'evidence', label: 'Evidence Center', icon: FileCheck2 },
  { id: 'scam-drill', label: 'Scam Drill', icon: GraduationCap },
  { id: 'integrations', label: 'Integration Status', icon: Activity },
];

export default function App() {
  const [activePage, setActivePage] = useState<NavPage>('home');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const refreshDashboard = useCallback(async () => {
    try {
      const data = await api.getDashboard();
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const navigate = (page: NavPage) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  const activeLabel = NAV_ITEMS.find((n) => n.id === activePage)?.label || 'Protection Home';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } lg:block lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0`}
      >
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Shield className="w-5 h-5 text-blue-600" />
            <span>SURAKSHA</span>
          </button>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav aria-label="Primary navigation" className="p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-6 py-4 mt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
          <div className="font-semibold text-slate-700">Make MCP Matter</div>
          <div>DEMO MODE Ready · Zero API Keys</div>
          <div>Manual Reporting Only (1930 / Chakshu)</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean 3-Zone Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-500 truncate whitespace-nowrap">
              SURAKSHA <span aria-hidden="true">/</span>{' '}
              <span className="text-slate-900 font-semibold">{activeLabel}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-500 whitespace-nowrap">
            <span>Rule Engine: Active</span>
            <span aria-hidden="true">·</span>
            <span>Cedar Policy: Enforced</span>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => navigate('live-guard')}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Start Live Guard
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activePage === 'home' && (
            <ProtectionDashboard
              summary={summary}
              loading={loading}
              onNavigate={navigate}
            />
          )}
          {activePage === 'live-guard' && (
            <LiveGuard onDataUpdated={refreshDashboard} onNavigate={navigate} />
          )}
          {activePage === 'guardian' && <GuardianDashboard onNavigate={navigate} />}
          {activePage === 'architecture' && <ArchitectureMonitor />}
          {activePage === 'evidence' && <EvidenceCenter onNavigate={navigate} />}
          {activePage === 'scam-drill' && <ScamDrill />}
          {activePage === 'integrations' && <IntegrationStatus />}
        </main>
      </div>
    </div>
  );
}
