import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './LowStockAlert.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function LowStockAlert({ token }) {
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [showAlert, setShowAlert] = useState(true);
  const [threshold, setThreshold] = useState(10);

  useEffect(() => {
    fetchLowStockProducts();
    // Refresh every 30 seconds
    const interval = setInterval(fetchLowStockProducts, 30000);
    return () => clearInterval(interval);
  }, [threshold]);

  const fetchLowStockProducts = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/products/low-stock?threshold=${threshold}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setLowStockProducts(response.data);
    } catch (error) {
      console.error('Error fetching low stock products:', error);
    }
  };

  if (!showAlert || lowStockProducts.length === 0) {
    return null;
  }

  return (
    <div className="low-stock-alert">
      <div className="alert-header">
        <div className="alert-title">
          <span className="alert-icon">⚠️</span>
          <h3>Low Stock Alert</h3>
          <span className="alert-count">{lowStockProducts.length} items</span>
        </div>
        <button onClick={() => setShowAlert(false)} className="close-alert">
          ×
        </button>
      </div>

      <div className="alert-body">
        <table className="low-stock-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Current Stock</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lowStockProducts.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="product-info">
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="product-mini-img"
                      />
                    )}
                    <span>{product.name}</span>
                  </div>
                </td>
                <td>
                  <span className="stock-number">{product.stock_quantity}</span>
                </td>
                <td>
                  <span
                    className={`stock-status ${
                      product.stock_quantity === 0
                        ? 'out-of-stock'
                        : product.stock_quantity <= 5
                        ? 'critical'
                        : 'low'
                    }`}
                  >
                    {product.stock_quantity === 0
                      ? 'Out of Stock'
                      : product.stock_quantity <= 5
                      ? 'Critical'
                      : 'Low Stock'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-footer">
        <button onClick={fetchLowStockProducts} className="btn-refresh">
          Refresh
        </button>
        <small>Updates automatically every 30 seconds</small>
      </div>
    </div>
  );
}

export default LowStockAlert;
