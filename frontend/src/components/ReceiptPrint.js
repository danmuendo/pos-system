import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import './ReceiptPrint.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const API_BASE_URL = API_URL.replace('/api', '');

function ReceiptPrint({ token }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const authToken = useMemo(
    () => token || sessionStorage.getItem('token') || localStorage.getItem('token'),
    [token]
  );

  useEffect(() => {
    if (!authToken) {
      setError('Session expired. Login again to print receipt.');
      setLoading(false);
      return;
    }

    const fetchReceipt = async () => {
      try {
        const response = await axios.get(`${API_URL}/transactions/${id}/receipt`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        setReceipt(response.data);
      } catch (fetchError) {
        setError(fetchError.response?.data?.error || 'Failed to load receipt');
      } finally {
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [authToken, id]);

  const formatCurrency = (amount) => `KSh ${Number(amount || 0).toFixed(2)}`;

  const UNIT_LABELS = { item: '', kg: 'kg', gram: 'g', litre: 'L', ml: 'ml' };
  const getUnitLabel = (unit) => UNIT_LABELS[unit] || '';

  const formatQty = (qty, unit) => {
    const n = Number(qty);
    if (!unit || unit === 'item') return String(Math.round(n));
    return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/0+$/, '');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const resolveAssetUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${API_BASE_URL}${url}`;
  };

  if (loading) {
    return <div className="receipt-page-state">Loading receipt...</div>;
  }

  if (error) {
    return (
      <div className="receipt-page-state">
        <p>{error}</p>
        <button className="receipt-btn" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!receipt) {
    return <div className="receipt-page-state">Receipt not found.</div>;
  }

  return (
    <div className="receipt-page">
      <div className="receipt-actions no-print">
        <button className="receipt-btn" onClick={() => window.print()}>
          Print
        </button>
        <button className="receipt-btn secondary" onClick={() => window.close()}>
          Close
        </button>
      </div>

      <div className="receipt-paper">
        {receipt.business_logo_url && (
          <div className="receipt-logo-wrap">
            <img src={resolveAssetUrl(receipt.business_logo_url)} alt="Business logo" className="receipt-logo" />
          </div>
        )}
        <h2>{receipt.business_name || 'POS System'}</h2>
        {receipt.business_phone && <p className="muted">{receipt.business_phone}</p>}
        {receipt.business_address && <p className="muted">{receipt.business_address}</p>}
        {receipt.business_tax_pin && <p className="muted">Tax PIN: {receipt.business_tax_pin}</p>}
        <p className="muted">Sales Receipt</p>
        <hr />

        <div className="receipt-line">
          <span>Receipt No:</span>
          <span>{receipt.transaction_code}</span>
        </div>
        <div className="receipt-line">
          <span>Date:</span>
          <span>{formatDate(receipt.receipt_date)}</span>
        </div>
        <div className="receipt-line">
          <span>Cashier:</span>
          <span>{receipt.cashier_name}</span>
        </div>
        <div className="receipt-line">
          <span>Payment:</span>
          <span>{(receipt.payment_method || '-').toUpperCase()}</span>
        </div>
        <div className="receipt-line">
          <span>Customer:</span>
          <span>{receipt.customer_phone || '-'}</span>
        </div>
        {receipt.mpesa_receipt_number && (
          <div className="receipt-line">
            <span>M-Pesa Ref:</span>
            <span>{receipt.mpesa_receipt_number}</span>
          </div>
        )}

        <hr />

        <table className="receipt-items">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item, index) => {
              const unitLabel = getUnitLabel(item.unit);
              return (
                <tr key={`${item.product_name}-${index}`}>
                  <td>{item.product_name}</td>
                  <td>
                    {formatQty(item.quantity, item.unit)}
                    {unitLabel ? ` ${unitLabel}` : ''}
                  </td>
                  <td>
                    {formatCurrency(item.unit_price)}
                    {unitLabel ? `/${unitLabel}` : ''}
                  </td>
                  <td>{formatCurrency(item.subtotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <hr />

        <div className="receipt-total">
          <strong>Total</strong>
          <strong>{formatCurrency(receipt.total_amount)}</strong>
        </div>
        <p className="receipt-footer">
          {receipt.receipt_footer || 'Thank you for your purchase.'}
        </p>
      </div>
    </div>
  );
}

export default ReceiptPrint;
