import React, { useEffect, useRef, useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  SearchIcon,
  LayoutDashboardIcon,
  MenuIcon,
  XIcon,
  ShieldCheckIcon,
  LandmarkIcon,
  ArrowLeftRightIcon,
  Scale as ScaleIcon,
  LogOutIcon,
  SettingsIcon,
  HistoryIcon,
} from 'lucide-react';
import { ConnectWalletButton } from '../ui/ConnectWalletButton';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { AuthUser, mediaUrl } from '../../utils/api';
import { Logo } from '../ui/Logo';
import { AdminBar } from './AdminBar';
import { OwnerBar } from './OwnerBar';
import { InstitutionBar } from './InstitutionBar';

function initials(user: AuthUser) {
  const source = (user.name || user.email || '?').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

function roleLabel(role: string) {
  if (role === 'owner') return 'Property owner';
  if (role === 'admin') return 'Admin';
  if (role === 'institution') return 'Institution';
  return 'Investor';
}

function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { disconnectWallet } = useWallet();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) {
    return (
      <Link
        to="/"
        onClick={onNavigate}
        className="px-3 py-2 rounded-lg text-sm font-medium text-cream-100 bg-void-700 border border-void-600 hover:border-accent/50"
      >
        Sign in
      </Link>
    );
  }

  const go = (path: string) => {
    setOpen(false);
    onNavigate?.();
    navigate(path);
  };

  const items = user.role === 'admin'
    ? [{ label: 'Admin', icon: <LayoutDashboardIcon size={16} />, path: '/admin' }]
    : [
      { label: 'Dashboard', icon: <LayoutDashboardIcon size={16} />, path: '/user' },
      { label: 'Transactions', icon: <HistoryIcon size={16} />, path: '/user?tab=transactions' },
      { label: 'Settings', icon: <SettingsIcon size={16} />, path: '/user?tab=settings' },
      { label: 'Verify', icon: <ShieldCheckIcon size={16} />, path: '/kyc' },
    ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-full border border-void-600 bg-void-800 py-1 pl-1 pr-3 text-cream-100 hover:border-accent/50"
      >
        {user.avatarUrl ? (
          <img src={mediaUrl(user.avatarUrl)} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-void-950 text-xs font-semibold">
            {initials(user)}
          </span>
        )}
        <span className="hidden lg:block max-w-[9rem] truncate text-sm">{user.name || user.email}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-void-600 bg-void-800 shadow-glow overflow-hidden">
          <div className="px-4 py-3 border-b border-void-700">
            <p className="text-cream-100 text-sm font-medium truncate">{user.name || 'Account'}</p>
            <p className="text-cream-400 text-xs truncate">{user.email}</p>
            <p className="text-accent text-xs mt-1">{roleLabel(user.role)}</p>
          </div>
          {items.map((item) => (
            <button
              key={item.path}
              type="button"
              role="menuitem"
              onClick={() => go(item.path)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-cream-200 hover:bg-void-700 text-left"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
              disconnectWallet();
              logout();
              navigate('/');
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-300 hover:bg-void-700 text-left border-t border-void-700"
          >
            <LogOutIcon size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (user?.role === 'admin') {
    return <AdminBar />;
  }

  if (user?.role === 'owner') {
    return <OwnerBar />;
  }

  if (user?.role === 'institution') {
    return <InstitutionBar />;
  }

  const navLinks = [
    { name: 'Home', path: '/home', icon: <HomeIcon size={18} /> },
    { name: 'Browse', path: '/browse', icon: <SearchIcon size={18} /> },
    { name: 'Market', path: '/market', icon: <ArrowLeftRightIcon size={18} /> },
    { name: 'Lend', path: '/lend', icon: <LandmarkIcon size={18} /> },
    { name: 'Govern', path: '/governance', icon: <ScaleIcon size={18} /> },
    { name: 'Dashboard', path: '/user', icon: <LayoutDashboardIcon size={18} /> },
    { name: 'Verify', path: '/kyc', icon: <ShieldCheckIcon size={18} /> },
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-void-700/80 bg-void-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-18 min-h-[4.5rem]">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <Logo />
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`
                      relative px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2
                      transition-colors duration-200
                      ${isActive
                        ? 'text-accent bg-accent-muted'
                        : 'text-cream-300 hover:text-cream-100 hover:bg-void-700/50'
                      }
                    `}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-lg bg-accent-muted border border-accent/20"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                    <span className="relative z-10">{link.icon}</span>
                    <span className="relative z-10">{link.name}</span>
                  </Link>
                );
              })}
            </div>

            <div className="hidden md:flex items-center gap-3">
              {user?.role !== 'admin' && (
                <div className="[&_button]:!bg-void-700 [&_button]:!border [&_button]:!border-void-600 [&_button]:!text-cream-100 [&_button:hover]:!border-accent/50 [&_button:hover]:!bg-void-600 [&_button]:!rounded-lg [&_button]:!font-medium">
                  <ConnectWalletButton />
                </div>
              )}
              <AccountMenu />
            </div>

            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2.5 rounded-lg text-cream-400 hover:text-cream-100 hover:bg-void-700 transition-colors"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <XIcon size={24} /> : <MenuIcon size={24} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              className="md:hidden border-t border-void-700/80 bg-void-900/95 backdrop-blur-xl"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="px-4 py-4 space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                      pathname === link.path
                        ? 'bg-accent-muted text-accent border border-accent/20'
                        : 'text-cream-300 hover:bg-void-700 hover:text-cream-100'
                    }`}
                  >
                    {link.icon}
                    {link.name}
                  </Link>
                ))}
                <div className="pt-3 mt-3 border-t border-void-700 flex flex-col items-stretch gap-3">
                  {user?.role !== 'admin' && (
                    <div className="flex justify-center">
                      <ConnectWalletButton />
                    </div>
                  )}
                  <AccountMenu onNavigate={() => setIsMenuOpen(false)} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </>
  );
}
