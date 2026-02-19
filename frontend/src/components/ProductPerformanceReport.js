import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './ProductPerformanceReport.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const startOfWeek = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
};

function ProductPerformanceReport({ token }) {
  const [dateFrom, setDateFrom] = useState(daysAgo(29));
  const [dateTo, setDateTo] = useState(todayStr());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatCurrency = (value) => `KSh ${Number(value || 0).toFixed(2)}`;
  const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

  const UNIT_LABELS = { item: '', kg: 'kg', gram: 'g', litre: 'L', ml: 'ml' };
  const getUnitLabel = (unit) => UNIT_LABELS[unit] || '';
  const formatQty = (qty, unit) => {
    const n = Number(qty);
    if (!unit || unit === 'item') return String(Math.round(n));
    return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/0+$/, '');
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(
        `${API_URL}/transactions/reports/product-performance?date_from=${dateFrom}&date_to=${dateTo}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReport(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load product performance report');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, token]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const applyPreset = (preset) => {
    const t = todayStr();
    switch (preset) {
      case 'today':  setDateFrom(t);             setDateTo(t); break;
      case 'week':   setDateFrom(startOfWeek());  setDateTo(t); break;
      case 'month':  setDateFrom(startOfMonth()); setDateTo(t); break;
      case 'last30': setDateFrom(daysAgo(29));    setDateTo(t); break;
      default: break;
    }
  };

  const getMarginClass = (pct) => {
    if (pct < 20) return 'margin-low';
    if (pct < 40) return 'margin-mid';
    return 'margin-good';
  };

  const exportCSV = () => {
    if (!report) return;
    const lines = [];
    lines.push(`"Product Performance Report: ${report.date_from} to ${report.date_to}"`);
    lines.push('');
    lines.push('"TOP SELLING PRODUCTS"');
    lines.push(['"#"', '"Product"', '"Category"', '"Qty Sold"', '"Revenue (KSh)"'].join(','));
    report.top_selling.forEach((item, i) => {
      const ul = getUnitLabel(item.unit);
      const qty = `${formatQty(item.quantity_sold, item.unit)}${ul ? ' ' + ul : ''}`;
      lines.push([`"${i + 1}"`, `"${item.product_name}"`, `"${item.category}"`, `"${qty}"`, `"${item.revenue.toFixed(2)}"`].join(','));
    });
    lines.push('');
    lines.push('"MARGIN ANALYSIS"');
    lines.push(['"Product"', '"Category"', '"Qty Sold"', '"Revenue (KSh)"', '"Est. Cost (KSh)"', '"Gross Profit (KSh)"', '"Margin %"'].join(','));
    report.low_margin.forEach((item) => {
      const ul = getUnitLabel(item.unit);
      const qty = `${formatQty(item.quantity_sold, item.unit)}${ul ? ' ' + ul : ''}`;
      lines.push([`"${item.product_name}"`, `"${item.category}"`, `"${qty}"`, `"${item.revenue.toFixed(2)}"`, `"${item.estimated_cost.toFixed(2)}"`, `"${item.gross_profit.toFixed(2)}"`, `"${item.margin_percent.toFixed(2)}%"`].join(','));
    });
    if (report.slow_movers?.length > 0) {
      lines.push('');
      lines.push('"SLOW MOVERS (No Sales in Period)"');
      lines.push(['"Product"', '"Category"', '"Stock"', '"Price (KSh)"'].join(','));
      report.slow_movers.forEach((item) => {
        lines.push([`"${item.product_name}"`, `"${item.category}"`, `"${item.stock_quantity}"`, `"${item.price.toFixed(2)}"`].join(','));
      });
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-performance_${report.date_from}_to_${report.date_to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="product-performance-report">
      <div className="report-header-row">
        <h2>Product Performance</h2>
        {report && (
          <button className="btn-export" onClick={exportCSV}>Export CSV</button>
        )}
      </div>

      <div className="report-controls-bar">
        <div className="date-presets">
          <button className="btn-preset" onClick={() => applyPreset('today')}>Today</button>
          <button className="btn-preset" onClick={() => applyPreset('week')}>This Week</button>
          <button className="btn-preset" onClick={() => applyPreset('month')}>This Month</button>
          <button className="btn-preset" onClick={() => applyPreset('last30')}>Last 30 Days</button>
        </div>
        <div className="date-inputs">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <button className="btn-primary" onClick={fetchReport}>Load</button>
        </div>
      </div>

      {error && <div className="message error">{error}</div>}
      {loading && <div className="loading">Loading product performance...</div>}

      {!loading && report && (
        <>
          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <div className="card-label">Period Revenue</div>
              <div className="card-value">{formatCurrency(report.summary?.total_revenue)}</div>
            </div>
            <div className="summary-card">
              <div className="card-label">Products Sold</div>
              <div className="card-value">{report.summary?.products_sold_count ?? 0}</div>
            </div>
            <div className="summary-card">
              <div className="card-label">Units Sold</div>
              <div className="card-value">
                {Number(report.summary?.total_quantity || 0)
                  .toFixed(2)
                  .replace(/\.?0+$/, '')}
              </div>
            </div>
          </div>

          {/* Top Selling */}
          <div className="report-section">
            <h3>Top Selling Products</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Qty Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {report.top_selling.length === 0 ? (
                  <tr><td colSpan="5">No completed sales in this date range.</td></tr>
                ) : (
                  report.top_selling.map((item, index) => {
                    const ul = getUnitLabel(item.unit);
                    return (
                      <tr key={`top-${item.product_id}`}>
                        <td className="rank-cell">#{index + 1}</td>
                        <td>{item.product_name}</td>
                        <td>{item.category}</td>
                        <td>{formatQty(item.quantity_sold, item.unit)}{ul ? ` ${ul}` : ''}</td>
                        <td>{formatCurrency(item.revenue)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Margin Analysis */}
          <div className="report-section">
            <h3>Margin Analysis</h3>
            {report.missing_cost_price_count > 0 && (
              <div className="warning-notice">
                {report.missing_cost_price_count} product(s) sold in this period have no cost price set — add cost prices in Products to include them here.
              </div>
            )}
            <div className="margin-legend">
              <span className="margin-badge margin-good">Good ≥40%</span>
              <span className="margin-badge margin-mid">Fair 20–39%</span>
              <span className="margin-badge margin-low">Low &lt;20%</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Qty Sold</th>
                  <th>Revenue</th>
                  <th>Est. Cost</th>
                  <th>Gross Profit</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {report.low_margin.length === 0 ? (
                  <tr>
                    <td colSpan="7">No margin data. Add cost prices to products to see margin analysis.</td>
                  </tr>
                ) : (
                  report.low_margin.map((item) => {
                    const ul = getUnitLabel(item.unit);
                    return (
                      <tr key={`margin-${item.product_id}`}>
                        <td>{item.product_name}</td>
                        <td>{item.category}</td>
                        <td>{formatQty(item.quantity_sold, item.unit)}{ul ? ` ${ul}` : ''}</td>
                        <td>{formatCurrency(item.revenue)}</td>
                        <td>{formatCurrency(item.estimated_cost)}</td>
                        <td>{formatCurrency(item.gross_profit)}</td>
                        <td>
                          <span className={`margin-badge ${getMarginClass(item.margin_percent)}`}>
                            {formatPercent(item.margin_percent)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Slow Movers */}
          {report.slow_movers?.length > 0 && (
            <div className="report-section">
              <h3>Slow Movers <span className="section-note">(no sales in this period)</span></h3>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {report.slow_movers.map((item) => (
                    <tr key={`slow-${item.product_id}`}>
                      <td>{item.product_name}</td>
                      <td>{item.category}</td>
                      <td>{item.stock_quantity}</td>
                      <td>{formatCurrency(item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ProductPerformanceReport;
