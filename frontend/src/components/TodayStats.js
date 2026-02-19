import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './TodayStats.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function TodayStats({ token }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    axios
      .get(`${API_URL}/transactions/reports/today-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setStats(res.data))
      .catch(() => {}); // silently fail — non-critical widget
  }, [token]);

  if (!stats) return null;

  return (
    <div className="today-stats">
      <div className="stat-card">
        <span className="stat-label">Today's Sales</span>
        <span className="stat-value">{stats.sales_count}</span>
      </div>
      <div className="stat-card highlight">
        <span className="stat-label">Total Revenue</span>
        <span className="stat-value">KSh {stats.total_sales.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Cash</span>
        <span className="stat-value">KSh {stats.cash_total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">M-Pesa</span>
        <span className="stat-value">KSh {stats.mpesa_total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
      </div>
      {stats.pending_count > 0 && (
        <div className="stat-card warn">
          <span className="stat-label">Pending</span>
          <span className="stat-value">{stats.pending_count}</span>
        </div>
      )}
    </div>
  );
}

export default TodayStats;
