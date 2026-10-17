import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Laptop,
  LogOut,
  UserCheck,
  ChevronDown,
  Search,
  Bell
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotification } from '../../context/NotificationContext.jsx';

export function TopBar({ activeTab, isCollapsed }) {
  const { theme, setTheme } = useTheme();
  const { user, logout, switchRole } = useAuth();
  const notify = useNotification();

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  const roles = [
    { id: 'admin', label: 'Administrator', user: 'Alexander Wright' },
    { id: 'purchasing', label: 'Purchasing Lead', user: 'Sarah Jenkins' },
    { id: 'warehouse', label: 'Warehouse Manager', user: 'Marcus Rodriguez' },
    { id: 'production', label: 'Production Supervisor', user: 'Elena Rostova' },
    { id: 'qc', label: 'Quality Inspector', user: 'David Chen' },
    { id: 'sales', label: 'Sales Executive', user: 'Jessica Miller' }
  ];

  const handleRoleSelect = async (roleId) => {
    setRoleMenuOpen(false);
    try {
      await switchRole(roleId);
      notify.success(`Switched role to: ${roleId.toUpperCase()}`);
    } catch (err) {
      notify.error(err.message || 'Failed to switch role');
    }
  };

  const getBreadcrumbTitle = (tab) => {
    switch (tab) {
      case 'dashboard': return 'Operational Dashboard';
      case 'inventory': return 'Inventory & Warehouse Management';
      case 'purchasing': return 'Purchasing & Supply Chain';
      case 'sales': return 'Sales Orders & Customer Fulfillment';
      case 'production': return 'Manufacturing & Production Control';
      case 'quality': return 'Quality Assurance & Inspection';
      case 'reports': return 'Enterprise Reports & Analytics';
      case 'admin': return 'System Administration & Security';
      default: return 'MetalWorks ERP';
    }
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 sticky top-0 z-20 transition-colors">
      {/* Left: Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400 font-medium">MetalWorks</span>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px]">
          {getBreadcrumbTitle(activeTab)}
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Theme Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            className="flex items-center gap-1.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors text-xs font-medium"
            title="Theme Selection (Light / Dark / System)"
            aria-label="Theme Menu"
          >
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : theme === 'light' ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Laptop className="w-4 h-4 text-brand-500" />
            )}
            <span className="capitalize hidden sm:inline">{theme}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {themeMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1 z-50 text-xs">
              <button
                onClick={() => { setTheme('light'); setThemeMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  theme === 'light' ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-500" />
                Light
              </button>
              <button
                onClick={() => { setTheme('dark'); setThemeMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  theme === 'dark' ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <Moon className="w-4 h-4 text-indigo-400" />
                Dark
              </button>
              <button
                onClick={() => { setTheme('system'); setThemeMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  theme === 'system' ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <Laptop className="w-4 h-4 text-brand-500" />
                System
              </button>
            </div>
          )}
        </div>

        {/* Demo Role Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors text-xs"
            title="Switch User Role for Testing"
          >
            <div className="w-2 h-2 rounded-full bg-brand-500"></div>
            <span className="font-semibold uppercase tracking-wider text-[11px] text-brand-600 dark:text-brand-400">
              {user?.role || 'Guest'}
            </span>
            <span className="hidden md:inline text-slate-400">|</span>
            <span className="hidden md:inline font-medium text-slate-600 dark:text-slate-300">
              {user?.fullName || user?.username}
            </span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Switch Role (Demo Persona)
              </div>
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleRoleSelect(r.id)}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                    user?.role === r.id ? 'bg-brand-50/60 dark:bg-brand-950/40 font-semibold text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div>
                    <div className="capitalize">{r.label}</div>
                    <div className="text-[10px] text-slate-400">{r.user}</div>
                  </div>
                  {user?.role === r.id && (
                    <UserCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          title="Sign Out"
          aria-label="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

export default TopBar;
