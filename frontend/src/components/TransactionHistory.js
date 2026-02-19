import React, { useState, useEffect, useCallback } from 'react'; // 1. Added useCallback
import axios from 'axios';
import './TransactionHistory.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function TransactionHistory({ token, user }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const canReverseTransactions = user?.role === 'owner' || user?.role === 'admin';

  // 2. Wrap fetchTransactions in useCallback
  const fetchTransactions = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTransactions(response.data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [token]); // token is a dependency here

  // 3. Include fetchTransactions in the dependency array
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const getStatusClass = (status) => {
    switch (status) {
      case 'completed':
        return 'status-completed';
      case 'pending':
        return 'status-pending';
      case 'failed':
        return 'status-failed';
      case 'voided':
        return 'status-voided';
      case 'refunded':
        return 'status-refunded';
      default:
        return '';
    }
  };

  const handleReverse = async (transactionId, mode) => {
    const reason = window.prompt(`Enter reason to ${mode} this transaction:`);
    if (!reason) return;

    try {
      await axios.post(
        `${API_URL}/transactions/${transactionId}/${mode}`,
        { reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage({ type: 'success', text: `Transaction ${mode}ed successfully` });
      setSelectedTransaction(null);
      fetchTransactions();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || `Failed to ${mode} transaction`,
      });
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const UNIT_LABELS = { item: '', kg: 'kg', gram: 'g', litre: 'L', ml: 'ml' };
  const getUnitLabel = (unit) => UNIT_LABELS[unit] || '';
  const formatQty = (qty, unit) => {
    const n = Number(qty);
    if (!unit || unit === 'item') return String(Math.round(n));
    return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/0+$/, '');
  };

  const openReceipt = (transactionId) => {
    if (!transactionId) return;
    window.open(`/receipt/${transactionId}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return <div className="loading">Loading transactions...</div>;
  }

  return (
    <div className="transaction-history">
      <h2>Transaction History</h2>
      {message.text && <div className={`message ${message.type}`}>{message.text}</div>}

      {transactions.length === 0 ? (
        <p className="no-transactions">No transactions yet</p>
      ) : (
        <div className="transactions-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction Code</th>
                <th>Customer Phone</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>M-Pesa Receipt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{formatDate(transaction.created_at)}</td>
                  <td>{transaction.transaction_code}</td>
                  <td>{transaction.customer_phone}</td>
                  <td>KSh {parseFloat(transaction.total_amount).toFixed(2)}</td>
                  <td>{transaction.payment_method || '-'}</td>
                  <td>
                    <span className={`status ${getStatusClass(transaction.status)}`}>
                      {transaction.status}
                    </span>
                  </td>
                  <td>{transaction.mpesa_receipt_number || '-'}</td>
                  <td className="actions-cell">
                    <button
                      onClick={() => setSelectedTransaction(transaction)}
                      className="btn-view"
                    >
                      View Details
                    </button>
                    {transaction.transaction_type === 'sale' &&
                      transaction.status === 'completed' && (
                        <button
                          onClick={() => openReceipt(transaction.id)}
                          className="btn-view"
                        >
                          Reprint
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTransaction && (
        <div className="modal-overlay" onClick={() => setSelectedTransaction(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Transaction Details</h3>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-row">
                <strong>Transaction Code:</strong>
                <span>{selectedTransaction.transaction_code}</span>
              </div>
              <div className="detail-row">
                <strong>Customer Phone:</strong>
                <span>{selectedTransaction.customer_phone}</span>
              </div>
              <div className="detail-row">
                <strong>Date:</strong>
                <span>{formatDate(selectedTransaction.created_at)}</span>
              </div>
              <div className="detail-row">
                <strong>Status:</strong>
                <span className={getStatusClass(selectedTransaction.status)}>
                  {selectedTransaction.status}
                </span>
              </div>
              <div className="detail-row">
                <strong>Type:</strong>
                <span>{selectedTransaction.transaction_type || 'sale'}</span>
              </div>
              <div className="detail-row">
                <strong>Payment Method:</strong>
                <span>{selectedTransaction.payment_method || '-'}</span>
              </div>
              {selectedTransaction.mpesa_receipt_number && (
                <div className="detail-row">
                  <strong>M-Pesa Receipt:</strong>
                  <span>{selectedTransaction.mpesa_receipt_number}</span>
                </div>
              )}
              {selectedTransaction.approval_reason && (
                <div className="detail-row">
                  <strong>Approval Reason:</strong>
                  <span>{selectedTransaction.approval_reason}</span>
                </div>
              )}

              <h4>Items</h4>
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTransaction.items.map((item, index) => {
                    const unitLabel = getUnitLabel(item.unit);
                    return (
                      <tr key={index}>
                        <td>{item.product_name}</td>
                        <td>
                          {formatQty(item.quantity, item.unit)}
                          {unitLabel ? ` ${unitLabel}` : ''}
                        </td>
                        <td>
                          KSh {parseFloat(item.unit_price).toFixed(2)}
                          {unitLabel ? `/${unitLabel}` : ''}
                        </td>
                        <td>KSh {parseFloat(item.subtotal).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="total-row">
                <strong>Total Amount:</strong>
                <strong>KSh {parseFloat(selectedTransaction.total_amount).toFixed(2)}</strong>
              </div>

              {selectedTransaction.transaction_type === 'sale' &&
                selectedTransaction.status === 'completed' && (
                  <div className="reversal-actions">
                    <button
                      className="btn-view"
                      onClick={() => openReceipt(selectedTransaction.id)}
                    >
                      Reprint Receipt
                    </button>
                  </div>
                )}

              {canReverseTransactions &&
                selectedTransaction.transaction_type === 'sale' &&
                selectedTransaction.status === 'completed' &&
                !selectedTransaction.reversed_by_transaction_id && (
                  <div className="reversal-actions">
                    <button
                      className="btn-reverse btn-void"
                      onClick={() => handleReverse(selectedTransaction.id, 'void')}
                    >
                      Void Transaction
                    </button>
                    <button
                      className="btn-reverse btn-refund"
                      onClick={() => handleReverse(selectedTransaction.id, 'refund')}
                    >
                      Refund Transaction
                    </button>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionHistory;