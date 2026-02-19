import React, { useEffect, useState, useCallback } from 'react'; // 1. Added useCallback
import axios from 'axios';
import './ShiftCloseReport.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function ShiftCloseReport({ token }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 2. Wrap fetchReport in useCallback
  // This memoizes the function so it doesn't trigger unnecessary re-renders
  const fetchReport = useCallback(async (targetDate) => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(
        `${API_URL}/transactions/reports/shift-close?date=${targetDate}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setReport(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load shift close report');
    } finally {
      setLoading(false);
    }
  }, [token]); // token is the only external dependency for the function itself

  // 3. Update useEffect to include dependencies
  useEffect(() => {
    fetchReport(date);
  }, [fetchReport, date]); // Now the report refreshes if the date or function changes

  const formatCurrency = (value) => `KSh ${Number(value).toFixed(2)}`;

  return (
    <div className="shift-close-report">
      <div className="shift-header">
        <h2>Shift Close Report</h2>
        <div className="shift-controls">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {/* Manual refresh button still works */}
          <button className="btn-primary" onClick={() => fetchReport(date)}>
            Load Report
          </button>
        </div>
      </div>

      {error && <div className="message error">{error}</div>}
      {loading && <div className="loading">Loading shift report...</div>}

      {!loading && report && (
        <>
          <div className="report-grid">
            <div className="report-card">
              <h4>Gross Sales</h4>
              <p>{formatCurrency(report.summary.gross_sales)}</p>
            </div>
            <div className="report-card">
              <h4>Cash Sales</h4>
              <p>
                {report.summary.cash_sales_count} ({formatCurrency(report.summary.cash_sales_total)})
              </p>
            </div>
            <div className="report-card">
              <h4>M-Pesa Sales</h4>
              <p>
                {report.summary.mpesa_sales_count} ({formatCurrency(report.summary.mpesa_sales_total)})
              </p>
            </div>
            <div className="report-card">
              <h4>Voids</h4>
              <p>
                {report.summary.void_count} ({formatCurrency(report.summary.void_total)})
              </p>
            </div>
            <div className="report-card">
              <h4>Refunds</h4>
              <p>
                {report.summary.refund_count} ({formatCurrency(report.summary.refund_total)})
              </p>
            </div>
            <div className="report-card">
              <h4>Net Sales</h4>
              <p>{formatCurrency(report.summary.net_sales)}</p>
            </div>
            <div className="report-card">
              <h4>Completed Sales</h4>
              <p>{report.summary.completed_sales_count}</p>
            </div>
            <div className="report-card">
              <h4>Exceptions</h4>
              <p>{report.summary.pending_count + report.summary.failed_count}</p>
            </div>
          </div>

          <div className="report-section">
            <h3>Cashier Summary</h3>
            <table>
              <thead>
                <tr>
                  <th>Cashier</th>
                  <th>Sales Count</th>
                  <th>Sales Total</th>
                </tr>
              </thead>
              <tbody>
                {report.cashiers.length === 0 ? (
                  <tr>
                    <td colSpan="3">No cashier activity</td>
                  </tr>
                ) : (
                  report.cashiers.map((cashier) => (
                    <tr key={cashier.username}>
                      <td>{cashier.username}</td>
                      <td>{cashier.sales_count}</td>
                      <td>{formatCurrency(cashier.sales_total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="report-section">
            <h3>Exceptions and Reversals</h3>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Payment</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.exceptions.length === 0 ? (
                  <tr>
                    <td colSpan="6">No exceptions for this date</td>
                  </tr>
                ) : (
                  report.exceptions.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.created_at).toLocaleString()}</td>
                      <td>{item.transaction_code}</td>
                      <td>{item.status}</td>
                      <td>{item.transaction_type}</td>
                      <td>{item.payment_method || '-'}</td>
                      <td>{formatCurrency(item.total_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default ShiftCloseReport;