import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  ShoppingBag,
  ShoppingCart,
  Factory,
  ShieldCheck,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  HardHat,
  Database
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

export function Sidebar({ activeTab, onSelectTab, isCollapsed, onToggleCollapse }) {
  const { user } = useAuth();

  const navGroups = [
    {
      label: 'OPERATIONS',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'inventory', label: 'Inventory & Stock', icon: Boxes },
        { id: 'purchasing', label: 'Purchasing', icon: ShoppingBag },
        { id: 'sales', label: 'Sales & Orders', icon: ShoppingCart },
        { id: 'production', label: 'Production & BOM', icon: Factory },
        { id: 'quality', label: 'Quality Control', icon: ShieldCheck },
      ]
    },
    {
      label: 'MANAGEMENT',
      items: [
        { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
        { id: 'admin', label: 'Administration & Audit', icon: Settings, adminOnly: true }
      ]
    }
  ];

  return (
    <aside
      className={`fixed top-0 left-0 z-30 h-screen bg-slate-900 text-slate-300 border-r border-slate-800 transition-all duration-300 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-brand-500/20">
              <HardHat className="w-5 h-5" />
            </div>
            <div className="truncate">
              <div className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                MetalWorks <span className="text-[10px] bg-brand-500/20 text-brand-400 font-mono px-1.5 py-0.2 rounded border border-brand-500/30">ERP</span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">Precision Manufacturing</div>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="w-8 h-8 mx-auto rounded-lg bg-brand-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-brand-500/20">
            <HardHat className="w-5 h-5" />
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className={`p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors ${isCollapsed ? 'hidden' : 'block'}`}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navGroups.map((group, idx) => {
          // Filter items by role permissions
          const visibleItems = group.items.filter(item => {
            if (item.adminOnly && user?.role !== 'admin') return false;
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={idx}>
              {!isCollapsed && (
                <div className="px-3 mb-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  {group.label}
                </div>
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      title={isCollapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-brand-600 text-white font-semibold shadow-sm shadow-brand-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      {!isCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        {!isCollapsed ? (
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono text-[10px]">PostgreSQL 16+</span>
            </div>
            <button
              onClick={onToggleCollapse}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              title="Collapse"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="w-full flex justify-center py-1 text-slate-400 hover:text-white"
            title="Expand"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
