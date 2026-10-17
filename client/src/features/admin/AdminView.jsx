import React, { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  Shield,
  Hash,
  Activity,
  Plus,
  Key,
  Building,
  Save,
  Search,
  CheckCircle,
  XCircle
} from 'lucide-react';
import api from '../../services/api.js';
import { useNotification } from '../../context/NotificationContext.jsx';
import Card, { CardHeader, CardTitle, CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input, { Select } from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Pagination } from '../../components/ui/Table.jsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx';

export function AdminView() {
  const notify = useNotification();

  const [activeTab, setActiveTab] = useState('users'); // 'users', 'settings', 'sequences', 'audit'
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState({});
  const [sequences, setSequences] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [auditSearch, setAuditSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals & Forms
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'warehouse'
  });

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [usersRes, settingsRes, seqRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/settings'),
        api.get('/admin/sequences')
      ]);
      setUsers(usersRes);
      setSettings(settingsRes);
      setSequences(seqRes);
    } catch (err) {
      notify.error(err.message || 'Failed to load administration data');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async (page = 1) => {
    try {
      const res = await api.get('/admin/audit-logs', {
        search: auditSearch,
        page,
        limit: auditPagination.limit
      });
      setAuditLogs(res.data);
      setAuditPagination(res.pagination);
    } catch (err) {
      notify.error(err.message || 'Failed to load audit logs');
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') loadAuditLogs(1);
  }, [activeTab, auditSearch]);

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      if (selectedUser) {
        await api.put(`/admin/users/${selectedUser.id}`, userForm);
        notify.success('User updated successfully');
      } else {
        await api.post('/admin/users', userForm);
        notify.success('User created successfully');
      }
      setShowUserModal(false);
      setSelectedUser(null);
      const updated = await api.get('/admin/users');
      setUsers(updated);
    } catch (err) {
      notify.error(err.message || 'Failed to save user');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put('/admin/settings', settings);
      setSettings(res);
      notify.success('Company profile & operational settings saved');
    } catch (err) {
      notify.error(err.message || 'Failed to update settings');
    }
  };

  const handleUpdateSequence = async (docType, seq) => {
    try {
      await api.put(`/admin/sequences/${docType}`, seq);
      notify.success(`Sequence format for ${docType} updated`);
    } catch (err) {
      notify.error(err.message || 'Failed to update sequence');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            System Administration & Security Control
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Role-based user management, company configuration, numbering sequences, and audit trails
          </p>
        </div>

        {activeTab === 'users' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSelectedUser(null);
              setUserForm({
                username: '',
                email: '',
                password: '',
                full_name: '',
                role: 'warehouse'
              });
              setShowUserModal(true);
            }}
            icon={Plus}
          >
            Create User Account
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold gap-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'users'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Users & Access Control ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Building className="w-4 h-4" />
          Company Profile & Policy
        </button>

        <button
          onClick={() => setActiveTab('sequences')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'sequences'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Hash className="w-4 h-4" />
          Document Numbering Sequences
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          System Audit Logs
        </button>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'users' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User Profile</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Assigned Role</TableHead>
                <TableHead>Account Status</TableHead>
                <TableHead>Member Since</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{u.full_name}</div>
                    <div className="text-xs font-mono text-brand-600 dark:text-brand-400">@{u.username}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'urgent' : u.role === 'qc' ? 'completed' : 'info'}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <span className="inline-flex items-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-medium text-rose-500">
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Deactivated
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => {
                        setSelectedUser(u);
                        setUserForm({
                          username: u.username,
                          email: u.email,
                          password: '',
                          full_name: u.full_name,
                          role: u.role,
                          is_active: u.is_active
                        });
                        setShowUserModal(true);
                      }}
                      className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
                    >
                      Edit User
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* TAB 2: COMPANY SETTINGS */}
      {activeTab === 'settings' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Company Legal & Operational Profile</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Printed on purchase orders, commercial invoices, and inspection certifications
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4 max-w-2xl">
              <Input
                label="Company Legal Name"
                value={settings.company_name || ''}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Tax Registration ID / VAT"
                  value={settings.tax_id || ''}
                  onChange={(e) => setSettings({ ...settings, tax_id: e.target.value })}
                />
                <Input
                  label="Operating Currency"
                  value={settings.currency || 'USD'}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Primary Operations Email"
                  type="email"
                  value={settings.email || ''}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                />
                <Input
                  label="Phone Number"
                  value={settings.phone || ''}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                />
              </div>

              <Input
                label="Headquarters Facility Address"
                value={settings.address || ''}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              />

              <div className="pt-3">
                <Button type="submit" variant="primary" icon={Save}>
                  Save Organization Settings
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: DOCUMENT NUMBERING SEQUENCES */}
      {activeTab === 'sequences' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Configurable Document Number Sequences</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Atomic sequence counters guaranteed to prevent duplicate document numbering across concurrent transactions
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Format Template</TableHead>
                  <TableHead className="text-right">Next Sequence #</TableHead>
                  <TableHead className="text-right">Digit Padding</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sequences.map((seq, idx) => (
                  <TableRow key={seq.doc_type}>
                    <TableCell className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {seq.doc_type}
                    </TableCell>
                    <TableCell>
                      <input
                        type="text"
                        value={seq.prefix}
                        onChange={(e) => {
                          const updated = [...sequences];
                          updated[idx].prefix = e.target.value;
                          setSequences(updated);
                        }}
                        className="w-20 text-xs p-1 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="text"
                        value={seq.format}
                        onChange={(e) => {
                          const updated = [...sequences];
                          updated[idx].format = e.target.value;
                          setSequences(updated);
                        }}
                        className="w-56 text-xs p-1 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <input
                        type="number"
                        value={seq.next_val}
                        onChange={(e) => {
                          const updated = [...sequences];
                          updated[idx].next_val = parseInt(e.target.value, 10);
                          setSequences(updated);
                        }}
                        className="w-24 text-xs p-1 text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {seq.padding} digits
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleUpdateSequence(seq.doc_type, seq)}
                      >
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <Card>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="relative w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit trail by user, action, entity..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Details Payload</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-slate-500 font-mono">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                    @{log.username}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-brand-600 dark:text-brand-400 font-medium">
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">
                    {log.entity_type}
                  </TableCell>
                  <TableCell className="text-xs font-mono font-medium">
                    {log.entity_id || '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-500 max-w-xs truncate" title={JSON.stringify(log.details)}>
                    {JSON.stringify(log.details)}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-400">
                    {log.ip_address}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            currentPage={auditPagination.page}
            totalPages={auditPagination.pages}
            totalItems={auditPagination.total}
            pageSize={auditPagination.limit}
            onPageChange={(page) => loadAuditLogs(page)}
          />
        </Card>
      )}

      {/* MODAL: CREATE / EDIT USER */}
      <Modal
        isOpen={showUserModal}
        onClose={() => { setShowUserModal(false); setSelectedUser(null); }}
        title={selectedUser ? `Edit User: @${selectedUser.username}` : 'Create ERP User Account'}
        description="Assign role permissions and credentials"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <Input
            label="Full Name"
            value={userForm.full_name}
            onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
            required
            placeholder="e.g. David Miller"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Username"
              value={userForm.username}
              onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              required
              disabled={!!selectedUser}
              placeholder="e.g. dmiller"
            />
            <Input
              label="Email Address"
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              required
              placeholder="dmiller@metalworks.io"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Role Assignment"
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            >
              <option value="admin">Administrator (Full Access)</option>
              <option value="purchasing">Purchasing Staff</option>
              <option value="warehouse">Warehouse Clerk</option>
              <option value="production">Production Manager</option>
              <option value="sales">Sales Representative</option>
              <option value="qc">Quality Control Inspector</option>
            </Select>

            <Input
              label={selectedUser ? 'New Password (leave blank to keep)' : 'Initial Password'}
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              required={!selectedUser}
              placeholder="••••••••"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowUserModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {selectedUser ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default AdminView;
