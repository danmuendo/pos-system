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

function Dashboard({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState('pos');
  const canManage = user?.role === 'owner' || user?.role === 'admin';
  const canManageUsers = user?.role === 'owner' || user?.role === 'admin';

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>{user.business_name || 'POS System'}</h1>
        <div className="user-info">
          <span>
            Welcome, {user.username} ({user.role})
          </span>
          <button onClick={onLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </header>

      <nav className="dashboard-nav">
        <button
          className={activeTab === 'pos' ? 'active' : ''}
          onClick={() => setActiveTab('pos')}
        >
          POS Checkout
        </button>
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
        >
          Products
        </button>
        <button
          className={activeTab === 'transactions' ? 'active' : ''}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
        {canManage && (
          <button
            className={activeTab === 'product-performance' ? 'active' : ''}
            onClick={() => setActiveTab('product-performance')}
          >
            Product Performance
          </button>
        )}
        {canManage && (
          <button
            className={activeTab === 'shift-close' ? 'active' : ''}
            onClick={() => setActiveTab('shift-close')}
          >
            Shift Close
          </button>
        )}
        {canManageUsers && (
          <button
            className={activeTab === 'staff' ? 'active' : ''}
            onClick={() => setActiveTab('staff')}
          >
            Staff
          </button>
        )}
        <button
          className={activeTab === 'account' ? 'active' : ''}
          onClick={() => setActiveTab('account')}
        >
          Account
        </button>
      </nav>

      <main className="dashboard-content">
        {/* Low Stock Alert - Shows on all tabs */}
        <LowStockAlert token={token} />

        {activeTab === 'pos' && <POSCheckout token={token} />}
        {activeTab === 'products' && <ProductManagement token={token} user={user} />}
        {activeTab === 'transactions' && <TransactionHistory token={token} user={user} />}
        {activeTab === 'product-performance' && canManage && (
          <ProductPerformanceReport token={token} />
        )}
        {activeTab === 'shift-close' && canManage && <ShiftCloseReport token={token} />}
        {activeTab === 'staff' && canManageUsers && <StaffManagement token={token} />}
        {activeTab === 'account' && <AccountSettings token={token} user={user} />}
      </main>
    </div>
  );
}

export default Dashboard;
