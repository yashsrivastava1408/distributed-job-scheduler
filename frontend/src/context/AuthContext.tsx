import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
}

interface Organization {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  apiKey?: string;
  apiKeyHash?: string | null;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  orgs: Organization[];
  projects: Project[];
  activeOrg: Organization | null;
  activeProject: Project | null;
  loading: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  selectOrg: (orgId: string) => void;
  selectProject: (projectId: string) => void;
  refreshProjects: () => Promise<void>;
  refreshOrgs: () => Promise<void>;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = '/api/v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('accessToken'));
  const [refreshToken, setRefreshToken] = useState<string | null>(localStorage.getItem('refreshToken'));
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Set user state from access token
  useEffect(() => {
    if (accessToken) {
      try {
        const decoded = jwtDecode<{ userId: string; email: string; role: 'admin' | 'member'; name?: string }>(accessToken);
        setUser({
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          name: decoded.name || decoded.email.split('@')[0],
        });
      } catch (err) {
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
    } else {
      setUser(null);
    }
  }, [accessToken]);

  // General API fetch helper that auto-attaches Authorization header and handles refreshing tokens
  const apiFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<any> => {
    let token = localStorage.getItem('accessToken');

    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
    });

    if (res.status === 401 && refreshToken) {
      // Try token refresh
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          const newAccess = data.data.accessToken;
          const newRefresh = data.data.refreshToken;

          setAccessToken(newAccess);
          setRefreshToken(newRefresh);
          localStorage.setItem('accessToken', newAccess);
          localStorage.setItem('refreshToken', newRefresh);

          // Retry original request with new token
          headers.set('Authorization', `Bearer ${newAccess}`);
          const retryRes = await fetch(`${API_BASE}${url}`, {
            ...options,
            headers,
          });

          if (retryRes.status === 204) return null;
          const json = await retryRes.json();
          if (!retryRes.ok) throw new Error(json.error?.message || 'API request failed');
          return json.data;
        } else {
          // Refresh failed - force logout
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setAccessToken(null);
          setRefreshToken(null);
          setUser(null);
          throw new Error('Session expired');
        }
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);
        throw new Error('Session expired');
      }
    }

    if (res.status === 204) return null;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error?.message || 'API request failed');
    return json.data;
  }, [refreshToken]);

  const refreshOrgs = useCallback(async () => {
    if (!accessToken) return;
    try {
      const orgList = await apiFetch('/organizations');
      setOrgs(orgList);
      if (orgList.length > 0) {
        // If there's an active org stored or default to first
        const savedOrgId = localStorage.getItem('activeOrgId');
        const selected = orgList.find((o: Organization) => o.id === savedOrgId) || orgList[0];
        setActiveOrg(selected);
        localStorage.setItem('activeOrgId', selected.id);
      } else {
        setActiveOrg(null);
      }
    } catch (err) {
      console.error('Failed to load organizations', err);
    }
  }, [accessToken, apiFetch]);

  const refreshProjects = useCallback(async () => {
    if (!activeOrg) {
      setProjects([]);
      setActiveProject(null);
      return;
    }
    try {
      const projectList = await apiFetch(`/organizations/${activeOrg.id}/projects`);
      setProjects(projectList);
      if (projectList.length > 0) {
        const savedProjectId = localStorage.getItem('activeProjectId');
        const selected = projectList.find((p: Project) => p.id === savedProjectId) || projectList[0];
        setActiveProject(selected);
        localStorage.setItem('activeProjectId', selected.id);
      } else {
        setActiveProject(null);
      }
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  }, [activeOrg, apiFetch]);

  // Load organizations on startup / login
  useEffect(() => {
    if (accessToken) {
      refreshOrgs().finally(() => setLoading(false));
    } else {
      setOrgs([]);
      setProjects([]);
      setActiveOrg(null);
      setActiveProject(null);
      setLoading(false);
    }
  }, [accessToken, refreshOrgs]);

  // Load projects when active org changes
  useEffect(() => {
    if (activeOrg) {
      refreshProjects();
    }
  }, [activeOrg, refreshProjects]);

  const login = async (access: string, refresh: string) => {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    setAccessToken(access);
    setRefreshToken(refresh);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('activeOrgId');
    localStorage.removeItem('activeProjectId');
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setOrgs([]);
    setProjects([]);
    setActiveOrg(null);
    setActiveProject(null);
  };

  const selectOrg = (orgId: string) => {
    const selected = orgs.find((o) => o.id === orgId);
    if (selected) {
      setActiveOrg(selected);
      localStorage.setItem('activeOrgId', selected.id);
      localStorage.removeItem('activeProjectId'); // clear project selection when switching orgs
    }
  };

  const selectProject = (projectId: string) => {
    const selected = projects.find((p) => p.id === projectId);
    if (selected) {
      setActiveProject(selected);
      localStorage.setItem('activeProjectId', selected.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        orgs,
        projects,
        activeOrg,
        activeProject,
        loading,
        login,
        logout,
        selectOrg,
        selectProject,
        refreshProjects,
        refreshOrgs,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
