import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Overview } from './pages/Overview';
import { Queues } from './pages/Queues';
import { Jobs } from './pages/Jobs';
import { Workers } from './pages/Workers';
import { DLQ } from './pages/DLQ';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Guard component to redirect users who are not logged in
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { accessToken, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping mr-2" />
        <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Loading session...</span>
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Route wrapper for public pages like Login/Register (redirects to home if already logged in)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { accessToken, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const DashboardRoutes: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="queues" element={<Queues />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="workers" element={<Workers />} />
        <Route path="dlq" element={<DLQ />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <DashboardRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
