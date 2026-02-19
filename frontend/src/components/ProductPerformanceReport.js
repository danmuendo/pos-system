import React, { useEffect, useState, useCallback } from 'react'; // 1. Added useCallback
import axios from 'axios';
import './ProductPerformanceReport.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const getDefaultFromDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
};

function ProductPerformanceReport({ token }) {
  const [dateFrom, setDateFrom] = useState(getDefaultFromDate());
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatCurrency = (value) => `KSh ${Number(value || 0).toFixed(2)}`;
  const formatPercent = (value) => `${Number(value || 0).toFixed(2)}%`;

  const UNIT_LABELS = { item: '', kg: 'kg', gram: 'g', litre: 'L', ml: 'ml' };
  const getUnitLabel = (unit) => UNIT_LABELS[unit] || '';
  const formatQty = (qty, unit) => {
    const n = Number(qty);
    if (!unit || unit === 'item') return String(Math.round(n));
    return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/0+$/, '');
  };

  // 2. Wrap fetchReport in useCallback
  // This ensures the function only changes if dateFrom, dateTo, or token change.
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
  }, [dateFrom, dateTo, token]); // Added dependencies here

  // 3. Add fetchReport to the dependency array
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="product-performance-report">
      <div className="report-header">
        <h2>Product Performance</h2>
        <div className="report-controls">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <button className="btn-primary" onClick={fetchReport}>
            Load Report
          </button>
        </div>
      </div>

      {error && <div className="message error">{error}</div>}
      {loading && <div className="loading">Loading product performance...</div>}

      {!loading && report && (
        <>
          <div className="report-section">
            <h3>Top Selling Products</h3>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Qty Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {report.top_selling.length === 0 ? (
                  <tr>
                    <td colSpan="4">No completed sales in this date range.</td>
                  </tr>
                ) : (
                  report.top_selling.map((item) => {
                    const unitLabel = getUnitLabel(item.unit);
                    return (
                      <tr key={`top-${item.product_id}-${item.product_name}`}>
                        <td>{item.product_name}</td>
                        <td>{item.category}</td>
                        <td>
                          {formatQty(item.quantity_sold, item.unit)}
                          {unitLabel ? ` ${unitLabel}` : ''}
                        </td>
                        <td>{formatCurrency(item.revenue)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="report-section">
            <h3>Low Margin Products (Needs Cost Price)</h3>
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
                    <td colSpan="7">
                      No low-margin data. Add cost price to products and ensure sales exist in range.
                    </td>
                  </tr>
                ) : (
                  report.low_margin.map((item) => {
                    const unitLabel = getUnitLabel(item.unit);
                    return (
                      <tr key={`margin-${item.product_id}-${item.product_name}`}>
                        <td>{item.product_name}</td>
                        <td>{item.category}</td>
                        <td>
                          {formatQty(item.quantity_sold, item.unit)}
                          {unitLabel ? ` ${unitLabel}` : ''}
                        </td>
                        <td>{formatCurrency(item.revenue)}</td>
                        <td>{formatCurrency(item.estimated_cost)}</td>
                        <td>{formatCurrency(item.gross_profit)}</td>
                        <td>{formatPercent(item.margin_percent)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default ProductPerformanceReport;