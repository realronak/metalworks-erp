import React, { useState } from 'react';
import { ThemeProvider } from './theme/ThemeContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import LoginView from './features/auth/LoginView.jsx';
import DashboardView from './features/dashboard/DashboardView.jsx';
import InventoryView from './features/inventory/InventoryView.jsx';
import PurchasingView from './features/purchasing/PurchasingView.jsx';
import SalesView from './features/sales/SalesView.jsx';
import ProductionView from './features/production/ProductionView.jsx';
import QualityView from './features/quality/QualityView.jsx';
import AdminView from './features/admin/AdminView.jsx';
import ReportsView from './features/reports/ReportsView.jsx';
import LoadingSpinner from './components/ui/LoadingSpinner.jsx';

function MainAppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <LoadingSpinner text="Initializing MetalWorks Workspace..." />
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <AppLayout activeTab={activeTab} onSelectTab={setActiveTab}>
      {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
      {activeTab === 'inventory' && <InventoryView />}
      {activeTab === 'purchasing' && <PurchasingView />}
      {activeTab === 'sales' && <SalesView />}
      {activeTab === 'production' && <ProductionView />}
      {activeTab === 'quality' && <QualityView />}
      {activeTab === 'reports' && <ReportsView />}
      {activeTab === 'admin' && <AdminView />}
    </AppLayout>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AuthProvider>
          <MainAppContent />
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
