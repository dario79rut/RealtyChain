import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOutIcon, MenuIcon, XIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Logo } from '../ui/Logo';

const LINKS = [
  { label: 'Corda desk', to: '/institution' },
  { label: 'Properties', to: '/browse' },
];

export function InstitutionBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-void-700 bg-void-950/95 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link to="/institution" className="flex items-center gap-3 min-w-0">
            <Logo />
            <span className="hidden sm:block text-[11px] uppercase tracking-[0.2em] text-cream-400 border-l border-void-600 pl-3">Institution</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3 py-2 text-sm ${pathname === item.to ? 'text-cream-100' : 'text-cream-400 hover:text-cream-100'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden md:block text-right">
              <div className="text-sm text-cream-100 leading-tight truncate max-w-[12rem]">{user?.name || user?.email}</div>
              <div className="text-[11px] uppercase tracking-wider text-cream-400">Corda node</div>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="hidden md:inline-flex items-center gap-2 rounded-lg border border-void-600 px-3 py-1.5 text-sm text-cream-200 hover:border-accent/50"
            >
              <LogOutIcon size={15} />
              Sign out
            </button>
            <button
              type="button"
              className="md:hidden p-2 rounded-lg text-cream-300 hover:bg-void-800"
              aria-label="Open institution menu"
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <XIcon size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
        </div>
        {open && (
          <div className="md:hidden pb-3 flex flex-col gap-1">
            {LINKS.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="px-2 py-2 text-sm text-cream-200">
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
