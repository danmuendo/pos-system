import React, { useState } from 'react';
import POSCheckout from './POSCheckout';
import ProductManagement from './ProductManagement';
import TransactionHistory from './TransactionHistory';
import LowStockAlert from './LowStockAlert';
import ShiftCloseReport from './ShiftCloseReport';
import ProductPerformanceReport from './ProductPerformanceReport';
import StaffManagement from './StaffManagement';
import AccountSettings from './AccountSettings';
import './Dashboard.css';

const NAV_ITEMS = [
  {
    id: 'pos',
    label: 'Live Checkout',
    shortLabel: 'POS',
    description: 'Sell fast with scan, search, and flexible cart controls.',
  },
  {
    id: 'products',
    label: 'Inventory',
    shortLabel: 'Products',
    description: 'Maintain products, pricing, categories, and stock.',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    shortLabel: 'History',
    description: 'Review sales, reversals, receipts, and filters.',
  },
  {
    id: 'product-performance',
    label: 'Performance',
    shortLabel: 'Performance',
    description: 'Track top sellers, margins, and slow movers.',
    roles: ['owner', 'manager'],
  },
  {
    id: 'shift-close',
    label: 'Shift Close',
    shortLabel: 'Shift',
    description: 'See day totals, cashier activity, and exceptions.',
    roles: ['owner', 'manager'],
  },
  {
    id: 'staff',
    label: 'Staff',
    shortLabel: 'Staff',
    description: 'Create, update, and manage store access.',
    roles: ['owner', 'manager'],
  },
  {
    id: 'account',
    label: 'Account',
    shortLabel: 'Account',
    description: 'Security, business profile, and settings.',
  },
];

function Dashboard({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState('pos');
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user?.role)
  );
  const activeItem = visibleNavItems.find((item) => item.id === activeTab) || visibleNavItems[0];

  const renderActiveView = () => {
    switch (activeTab) {
      case 'pos':
        return <POSCheckout token={token} />;
      case 'products':
        return <ProductManagement token={token} user={user} />;
      case 'transactions':
        return <TransactionHistory token={token} user={user} />;
      case 'product-performance':
        return <ProductPerformanceReport token={token} />;
      case 'shift-close':
        return <ShiftCloseReport token={token} />;
      case 'staff':
        return <StaffManagement token={token} user={user} />;
      case 'account':
      default:
        return <AccountSettings token={token} user={user} />;
    }
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">PS</span>
          <div>
            <p className="brand-eyebrow">Retail cockpit</p>
            <h1>{user.business_name || 'POS System'}</h1>
          </div>
        </div>

        <div className="sidebar-user-card">
          <span className="user-role-pill">{user.role}</span>
          <h2>{user.username}</h2>
          <p>Signed in to the active store workspace.</p>
        </div>

        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="sidebar-nav-title">{item.label}</span>
              <span className="sidebar-nav-copy">{item.description}</span>
            </button>
          ))}
        </nav>

        <button onClick={onLogout} className="btn-logout">
          Sign Out
        </button>
      </aside>

      <div className="dashboard-main">
        <header className="workspace-header">
          <div>
            <p className="workspace-kicker">Current workspace</p>
            <h2>{activeItem?.label || 'Dashboard'}</h2>
            <p className="workspace-copy">{activeItem?.description}</p>
          </div>

          <div className="workspace-meta">
            <div className="workspace-chip">
              <span className="workspace-chip-label">Operator</span>
              <strong>{user.username}</strong>
            </div>
            <div className="workspace-chip">
              <span className="workspace-chip-label">Module</span>
              <strong>{activeItem?.shortLabel || 'Dashboard'}</strong>
            </div>
          </div>
        </header>

        <main className="dashboard-content">
          <LowStockAlert token={token} />
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
