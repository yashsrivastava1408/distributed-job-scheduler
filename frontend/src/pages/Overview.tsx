import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Layers,
  Cpu,
  AlertOctagon,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const Overview: React.FC = () => {
  const { activeProject, apiFetch } = useAuth();

  // 1. Fetch Project metrics
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ['project-metrics', activeProject?.id],
    queryFn: () => apiFetch(`/projects/${activeProject?.id}/metrics`),
    enabled: !!activeProject?.id,
  });

  // 2. Fetch Queues to show queue count and pause status
  const { data: queues, isLoading: loadingQueues } = useQuery({
    queryKey: ['queues', activeProject?.id],
    queryFn: () => apiFetch(`/queues/project/${activeProject?.id}`),
    enabled: !!activeProject?.id,
  });

  // 3. Fetch Workers count
  const { data: workers, isLoading: loadingWorkers } = useQuery({
    queryKey: ['workers'],
    queryFn: () => apiFetch('/workers'),
  });

  const activeWorkers = workers?.filter((w: any) => w.status === 'online').length || 0;

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8 bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
        <Layers className="w-12 h-12 text-slate-500 mb-4 animate-bounce" />
        <h3 className="text-xl font-bold text-slate-300">No Project Selected</h3>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">Please select or create a project in the sidebar to view the dashboard.</p>
      </div>
    );
  }

  const chartData = [
    { name: 'Completed', value: metrics?.completedJobs || 0, color: '#10b981' },
    { name: 'Running/Active', value: metrics?.activeJobs || 0, color: '#8b5cf6' },
    { name: 'Queued', value: metrics?.queuedJobs || 0, color: '#3b82f6' },
    { name: 'Dead Letter', value: metrics?.deadLetterJobs || 0, color: '#f43f5e' },
  ];

  const hasData = chartData.some(d => d.value > 0);

  const stats = [
    {
      label: 'Success Rate',
      value: `${metrics?.successRate !== undefined ? metrics.successRate : 0}%`,
      icon: TrendingUp,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      description: 'Jobs successfully completed vs failures',
    },
    {
      label: 'Active Workers',
      value: activeWorkers,
      icon: Cpu,
      color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
      description: 'Online workers processing claims',
    },
    {
      label: 'Backlog Depth',
      value: metrics?.queuedJobs || 0,
      icon: Clock,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      description: 'Pending jobs awaiting worker pickup',
    },
    {
      label: 'DLQ Failures',
      value: metrics?.deadLetterJobs || 0,
      icon: AlertOctagon,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      description: 'Failed jobs requiring manual retry',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 glass-panel border border-slate-800/80 rounded-2xl">
        <div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            Project Dashboard
          </h3>
          <p className="text-slate-400 text-xs mt-1">Real-time status updates and execution overview</p>
        </div>
        <div className="flex gap-4">
          <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl text-center min-w-28">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">Total Jobs</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{metrics?.totalJobs || 0}</span>
          </div>
          <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl text-center min-w-28">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">Active Queues</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{queues?.length || 0}</span>
          </div>
        </div>
      </div>

      {/* Grid of Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className="glass-panel border border-slate-800/50 rounded-xl p-5 hover:scale-[1.01] hover:border-slate-850 transition-all flex flex-col justify-between shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs text-slate-400 font-medium block">{stat.label}</span>
                  <span className="text-2xl font-bold text-slate-100 mt-2 block text-slate-200">{stat.value}</span>
                </div>
                <div className={`p-2 rounded-lg border ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-4 leading-normal">{stat.description}</p>
            </div>
          );
        })}
      </div>

      {/* Chart and distribution info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 glass-panel border border-slate-800/40 rounded-xl p-6 flex flex-col shadow-lg">
          <h4 className="text-sm font-bold text-slate-300 mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-400" /> Job Execution Distribution
          </h4>
          <div className="flex-1 min-h-[300px] flex items-center justify-center">
            {hasData ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.filter(d => d.value > 0)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}
                    itemStyle={{ color: '#f1f5f9', fontSize: '12px' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.filter(d => d.value > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-10">
                <p className="text-slate-500 text-sm">No job executions recorded in this project yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Status percentages / break down */}
        <div className="glass-panel border border-slate-800/40 rounded-xl p-6 flex flex-col justify-between shadow-lg">
          <div>
            <h4 className="text-sm font-bold text-slate-300 mb-6">Execution Breakdown</h4>
            <div className="space-y-4">
              {chartData.map((d, index) => {
                const percent = metrics?.totalJobs
                  ? ((d.value / metrics.totalJobs) * 100).toFixed(1)
                  : '0.0';
                return (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-950/40 border border-slate-850 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-xs text-slate-300 font-medium">{d.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-200 block">{d.value}</span>
                      <span className="text-[10px] text-slate-500 block">{percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pt-6 border-t border-slate-850">
            <Link
              to="/jobs"
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-850 hover:bg-slate-800 text-slate-200 font-medium rounded-xl text-xs transition-colors cursor-pointer border border-slate-800"
            >
              Explore All Jobs <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Queue health quick check */}
      <div className="glass-panel border border-slate-800/40 rounded-xl p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h4 className="text-sm font-bold text-slate-300">Queues Summary</h4>
          <Link to="/queues" className="text-xs text-violet-400 hover:text-violet-300 font-semibold hover:underline">
            Manage Queues
          </Link>
        </div>
        {queues && queues.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {queues.map((q: any) => (
              <div key={q.id} className="p-4 bg-slate-950/30 border border-slate-850 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">{q.name}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 block">Priority: {q.priority}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-xs text-slate-300 font-medium block">Backlog</span>
                    <span className="text-xs font-bold text-slate-200 block">{q.backlogSize}</span>
                  </div>
                  {q.isPaused ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      PAUSED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ACTIVE
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-slate-500 text-xs">No queues created yet for this project.</p>
          </div>
        )}
      </div>
    </div>
  );
};
