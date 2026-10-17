import React, { useState } from 'react';
import { HardHat, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotification } from '../../context/NotificationContext.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';

export function LoginView() {
  const { login, switchRole } = useAuth();
  const notify = useNotification();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(username, password);
      notify.success('Signed in successfully');
    } catch (err) {
      notify.error(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemo = async (role) => {
    setIsLoading(true);
    try {
      await switchRole(role);
      notify.success(`Signed in as ${role.toUpperCase()}`);
    } catch (err) {
      notify.error(err.message || 'Demo login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      {/* Background ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto text-white shadow-lg shadow-brand-500/20 mb-3">
            <HardHat className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">MetalWorks ERP</h1>
          <p className="text-xs text-slate-400 mt-1">Industrial Manufacturing & Precision Inventory</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username or Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="e.g. admin or admin@metalworks.io"
              className="bg-slate-950/60 border-slate-800 text-white"
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="bg-slate-950/60 border-slate-800 text-white"
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center py-2.5"
              isLoading={isLoading}
            >
              Sign In to Workspace
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>

          {/* Quick Demo Personas */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
              Quick Demo Personas (1-Click)
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickDemo('admin')}
                className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-left transition-colors"
              >
                <div className="font-semibold text-brand-400">Admin</div>
                <div className="text-[10px] text-slate-400">Full System Access</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('purchasing')}
                className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-left transition-colors"
              >
                <div className="font-semibold text-sky-400">Purchasing</div>
                <div className="text-[10px] text-slate-400">POs & Receipts</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('warehouse')}
                className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-left transition-colors"
              >
                <div className="font-semibold text-amber-400">Warehouse</div>
                <div className="text-[10px] text-slate-400">Stock & Transfers</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('production')}
                className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-left transition-colors"
              >
                <div className="font-semibold text-purple-400">Production</div>
                <div className="text-[10px] text-slate-400">BOM & Work Orders</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('qc')}
                className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-left transition-colors"
              >
                <div className="font-semibold text-emerald-400">Quality (QC)</div>
                <div className="text-[10px] text-slate-400">Inspections & NCRs</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('sales')}
                className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-left transition-colors"
              >
                <div className="font-semibold text-rose-400">Sales</div>
                <div className="text-[10px] text-slate-400">Orders & Invoices</div>
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-slate-500">
          PostgreSQL Database Connected • Session Protected
        </div>
      </div>
    </div>
  );
}

export default LoginView;
