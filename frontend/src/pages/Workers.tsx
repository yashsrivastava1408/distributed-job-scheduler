import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  Cpu,
  Server,
  Activity,
  Clock,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Monitor,
  Database
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

export const Workers: React.FC = () => {
  const { apiFetch } = useAuth();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // Fetch all workers
  const { data: workers, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['workers'],
    queryFn: () => apiFetch('/workers'),
  });

  // Fetch details of selected worker (heartbeats, executions)
  const { data: workerDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['worker-detail', selectedWorkerId],
    queryFn: () => apiFetch(`/workers/${selectedWorkerId}`),
    enabled: !!selectedWorkerId,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 status-pill-online';
      case 'draining':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'offline':
      default:
        return 'bg-slate-500/15 text-slate-400 border border-slate-700/30 status-pill-offline';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            Workers Registry
          </h3>
          <p className="text-slate-400 text-xs mt-1">Monitor connected compute instances, active load limits, and system telemetry</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
          className="flex items-center gap-2 py-2 px-4 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:text-white font-medium rounded-xl text-xs transition-all cursor-pointer"
        >
          {isRefetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4" /> Refresh</>}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </div>
      ) : workers && workers.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Workers list */}
          <div className="lg:col-span-2 space-y-4">
            {workers.map((worker: any) => {
              const isActive = selectedWorkerId === worker.id;
              const heartbeatTime = new Date(worker.lastHeartbeatAt).toLocaleTimeString();
              return (
                <div
                  key={worker.id}
                  onClick={() => setSelectedWorkerId(worker.id)}
                  className={`p-5 glass-panel border rounded-xl shadow-md transition-all cursor-pointer hover:scale-[1.005] ${
                    isActive ? 'border-violet-500/60 bg-slate-900/60 shadow-violet-950/20' : 'border-slate-800/50 hover:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl">
                        <Server className={`w-5 h-5 ${worker.status === 'online' ? 'text-violet-400' : 'text-slate-500'}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">{worker.hostname}</h4>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          ID: {worker.id.slice(0, 8)} | PID: {worker.pid}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="text-[9px] text-slate-500 block">Polling Queues</span>
                        <span className="text-xs text-slate-300 block mt-0.5 truncate max-w-40" title={worker.queues.join(', ')}>
                          {worker.queues.join(', ')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-500 block">Concurrency Limit</span>
                        <span className="text-xs text-slate-300 font-semibold block mt-0.5">{worker.concurrency} slots</span>
                      </div>
                      <div>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ${getStatusBadge(worker.status)}`}>
                          {worker.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-900 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Started: {new Date(worker.startedAt).toLocaleString()}</span>
                    <span>Last Heartbeat: <span className="text-slate-400 font-medium">{heartbeatTime}</span></span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Worker details & telemetry */}
          <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-6 shadow-lg h-fit">
            {selectedWorkerId ? (
              loadingDetail ? (
                <div className="flex flex-col items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-400 mb-2" />
                  <p className="text-slate-500 text-xs">Loading telemetry...</p>
                </div>
              ) : workerDetail ? (
                <div className="space-y-6">
                  {/* Summary */}
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block">Worker Details</span>
                    <h4 className="text-base font-bold text-slate-200 mt-1">{workerDetail.hostname}</h4>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">PID: {workerDetail.pid}</p>
                  </div>

                  {/* Active Jobs */}
                  <div>
                    <h5 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-violet-400" /> Active Jobs ({workerDetail.jobs?.length || 0})</h5>
                    {workerDetail.jobs && workerDetail.jobs.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {workerDetail.jobs.map((job: any) => (
                          <div key={job.id} className="p-2.5 bg-slate-950/40 border border-slate-850 rounded-lg flex items-center justify-between text-xs">
                            <div>
                              <span className="font-semibold text-slate-300 block">{job.type}</span>
                              <span className="text-[9px] text-slate-500 font-mono block truncate max-w-32">{job.id}</span>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase">
                              {job.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-950/20 border border-dashed border-slate-850 rounded-lg text-center text-xs text-slate-500">
                        No active jobs currently running.
                      </div>
                    )}
                  </div>

                  {/* Heartbeats Line Chart */}
                  <div>
                    <h5 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5 text-violet-400" /> Active Job Load History</h5>
                    {workerDetail.heartbeats && workerDetail.heartbeats.length > 0 ? (
                      <div className="h-36 flex items-end">
                        <ResponsiveContainer width="100%" height={140}>
                          <AreaChart
                            data={workerDetail.heartbeats.slice().reverse()}
                            margin={{ top: 5, right: 5, left: -30, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                            <XAxis
                              dataKey="timestamp"
                              tickFormatter={(ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              stroke="#64748b"
                              fontSize={9}
                            />
                            <YAxis stroke="#64748b" fontSize={9} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                              labelFormatter={(ts) => new Date(ts).toLocaleString()}
                              itemStyle={{ color: '#8b5cf6', fontSize: '11px' }}
                            />
                            <Area type="monotone" dataKey="activeJobCount" stroke="#8b5cf6" fill="rgba(139, 92, 246, 0.1)" strokeWidth={1.5} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-950/20 border border-dashed border-slate-850 rounded-lg text-center text-xs text-slate-500">
                        No heartbeats recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-xs">Error loading worker details.</p>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-56 text-center text-slate-500">
                <Server className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs">Select a worker instance from the list to view live telemetry and active jobs.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
          <Server className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h4 className="text-base font-bold text-slate-300">No Workers Available</h4>
          <p className="text-slate-500 text-xs mt-1">Start a worker process using `npm run worker` to connect to the queue.</p>
        </div>
      )}
    </div>
  );
};
