import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import {
  LayoutDashboard,
  Layers,
  Search,
  Cpu,
  AlertTriangle,
  LogOut,
  Building,
  Briefcase,
  Plus,
  Key,
  Copy,
  Check,
  User,
  X,
  Loader2
} from 'lucide-react';

export const Layout: React.FC = () => {
  const {
    user,
    orgs,
    projects,
    activeOrg,
    activeProject,
    selectOrg,
    selectProject,
    logout,
    refreshOrgs,
    refreshProjects,
    apiFetch,
  } = useAuth();

  // Initialize socket listener to handle auto invalidation
  useSocket();

  const location = useLocation();
  const navigate = useNavigate();
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showProjModal, setShowProjModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newProjName, setNewProjName] = useState('');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  const [copiedKey, setCopiedKey] = useState(false);

  const copyApiKey = () => {
    if (activeProject?.apiKey) {
      navigator.clipboard.writeText(activeProject.apiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setModalError('');
    try {
      const data = await apiFetch('/organizations', {
        method: 'POST',
        body: JSON.stringify({ name: newOrgName }),
      });
      await refreshOrgs();
      selectOrg(data.id);
      setShowOrgModal(false);
      setNewOrgName('');
    } catch (err) {
      setModalError((err as Error).message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const createProj = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setModalError('');
    try {
      if (!activeOrg) return;
      const data = await apiFetch(`/organizations/${activeOrg.id}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: newProjName }),
      });
      await refreshProjects();
      selectProject(data.id);
      setShowProjModal(false);
      setNewProjName('');

      // Show API key creation feedback
      alert(`Project created successfully!\n\nYOUR API KEY:\n${data.apiKey}\n\nPlease copy this key now. It will not be shown again!`);
    } catch (err) {
      setModalError((err as Error).message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const navItems = [
    { label: 'Overview', path: '/', icon: LayoutDashboard },
    { label: 'Queues', path: '/queues', icon: Layers },
    { label: 'Job Explorer', path: '/jobs', icon: Search },
    { label: 'Workers', path: '/workers', icon: Cpu },
    { label: 'DLQ / Failures', path: '/dlq', icon: AlertTriangle },
  ];

  return (
    <div className="flex h-screen bg-[#070b14] overflow-hidden text-slate-100 font-sans">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Sidebar */}
      <aside className="w-72 bg-slate-900/30 backdrop-blur-md border-r border-slate-800/80 flex flex-col z-20">
        {/* Header / Brand */}
        <div className="p-6 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-lg text-white font-bold shadow-md shadow-violet-600/10">
              JS
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight bg-gradient-to-r from-violet-100 to-slate-200 bg-clip-text text-transparent">
                JobScheduler
              </h1>
              <span className="text-[10px] text-slate-500 tracking-wider uppercase font-semibold">Distributed Daemon</span>
            </div>
          </div>
        </div>

        {/* Tenant Selectors */}
        <div className="px-4 py-4 border-b border-slate-800/40 space-y-3">
          {/* Org Selector */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Organization</label>
            <div className="flex gap-2">
              <select
                value={activeOrg?.id || ''}
                onChange={(e) => selectOrg(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-950/70 border border-slate-850 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-violet-500/80 transition-colors"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
                {orgs.length === 0 && <option value="">No Organizations</option>}
              </select>
              <button
                onClick={() => setShowOrgModal(true)}
                className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Create Organization"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Project Selector */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Project</label>
            <div className="flex gap-2">
              <select
                value={activeProject?.id || ''}
                onChange={(e) => selectProject(e.target.value)}
                disabled={!activeOrg}
                className="flex-1 px-3 py-1.5 bg-slate-950/70 border border-slate-850 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-violet-500/80 transition-colors disabled:opacity-55"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                {projects.length === 0 && <option value="">No Projects</option>}
              </select>
              <button
                onClick={() => setShowProjModal(true)}
                disabled={!activeOrg}
                className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:text-white rounded-lg transition-colors disabled:opacity-55 cursor-pointer"
                title="Create Project"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-violet-600/15 text-violet-300 border-l-2 border-violet-500 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-violet-300' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Project API Key info if present */}
        {activeProject && activeProject.apiKey && (
          <div className="mx-4 my-3 p-3 bg-slate-950/50 border border-slate-850 rounded-xl">
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-1">
              <span className="flex items-center gap-1"><Key className="w-3 h-3 text-amber-500" /> API KEY (COPY ONCE)</span>
              <button onClick={copyApiKey} className="hover:text-slate-300 cursor-pointer">
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="font-mono text-[10px] truncate text-slate-300 bg-slate-900/60 p-1.5 rounded border border-slate-800/40 select-all">
              {activeProject.apiKey}
            </div>
          </div>
        )}

        {/* User Profile / Logout */}
        <div className="p-4 border-t border-slate-800/60 bg-slate-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700/50">
                <User className="w-4 h-4 text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        <header className="h-16 border-b border-slate-800/40 px-8 flex items-center justify-between bg-slate-950/10 backdrop-blur-sm">
          <h2 className="text-sm font-semibold tracking-wider text-slate-400">
            {activeOrg ? activeOrg.name : 'No Org'} / <span className="text-slate-200">{activeProject ? activeProject.name : 'No Project'}</span>
          </h2>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 status-pill-online">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> WebSocket Sync
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 animate-fade-in-up">
          <Outlet />
        </div>
      </main>

      {/* Organization Modal */}
      {showOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-100">New Organization</h3>
              <button onClick={() => setShowOrgModal(false)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            {modalError && <p className="mb-4 text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">{modalError}</p>}
            <form onSubmit={createOrg} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 font-medium mb-1">Organization Name</label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-2 bg-violet-600 hover:bg-violet-500 font-medium rounded-xl text-sm text-white transition-colors cursor-pointer"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Project Modal */}
      {showProjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-100">New Project</h3>
              <button onClick={() => setShowProjModal(false)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            {modalError && <p className="mb-4 text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">{modalError}</p>}
            <form onSubmit={createProj} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 font-medium mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="e.g. Production App"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-2 bg-violet-600 hover:bg-violet-500 font-medium rounded-xl text-sm text-white transition-colors cursor-pointer"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Project'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
