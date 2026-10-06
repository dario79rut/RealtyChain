import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { SolanaProviders } from './solana/provider';
import { WalletProvider } from './context/WalletContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getToken } from './utils/api';
import { Layout } from './components/layout/Layout';

import Home from './pages/Home';
import About from './pages/About';
import Browse from './pages/Browse';
import Admin from './pages/Admin';
import User from './pages/User';
import PropertyDetail from './pages/PropertyDetail';
import Login from './pages/Login';
import Kyc from './pages/Kyc';
import Market from './pages/Market';
import Governance from './pages/Governance';
import Lend from './pages/Lend';
import AdminUserAdmin from './pages/AdminUserAdmin';
import Institution from './pages/Institution';

const client = new QueryClient();

function WalletLoading() {
  return (
    <div className="min-h-screen w-full bg-void-950 flex items-center justify-center px-4">
      <p className="text-cream-400 text-sm">Loading …</p>
    </div>
  );
}

function AppRoutes() {
  const { isLoggedIn, authReady, user } = useAuth();
  const location = useLocation();

  const publicPaths = ['/', '/adminuseradmin_useradminuser'];
  const isPublic = publicPaths.includes(location.pathname);

  if (!authReady && (!isPublic || (location.pathname === '/' && getToken()))) {
    return <WalletLoading />;
  }

  if (location.pathname === '/' && isLoggedIn) {
    return <Navigate to={user?.role === 'institution' ? '/institution' : '/home'} replace />;
  }

  if (!isPublic && !isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      {/* Standalone, chrome-less pages */}
      <Route path="/" element={<Login />} />
      <Route path="/adminuseradmin_useradminuser" element={<AdminUserAdmin />} />

      {/* Pages wrapped in the app layout */}
      <Route element={<Layout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/user" element={<User />} />
        <Route path="/kyc" element={<Kyc />} />
        <Route path="/market" element={<Market />} />
        <Route path="/governance" element={<Governance />} />
        <Route path="/lend" element={<Lend />} />
        <Route path="/property/:id" element={<PropertyDetail />} />
        <Route path="/institution" element={<Institution />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <SolanaProviders>
      <QueryClientProvider client={client}>
        <WalletProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WalletProvider>
      </QueryClientProvider>
    </SolanaProviders>
  );
}

export default App;
