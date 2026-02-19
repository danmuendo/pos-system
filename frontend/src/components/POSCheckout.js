import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './POSCheckout.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function POSCheckout({ token }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mpesa');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [scanCode, setScanCode] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API_URL}/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const addToCart = (product) => {
    const existingItem = cart.find((item) => item.product_id === product.id);

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          name: product.name,
          price: parseFloat(product.price),
          quantity: 1,
        },
      ]);
    }
  };

  const findByBarcode = (barcode) => {
    const normalized = String(barcode || '').trim().toLowerCase();
    if (!normalized) return null;

    return products.find(
      (product) => String(product.barcode || '').trim().toLowerCase() === normalized
    );
  };

  const handleScanSubmit = (e) => {
    e.preventDefault();
    const product = findByBarcode(scanCode);
    if (!product) {
      setMessage({ type: 'error', text: `No product found for barcode "${scanCode}"` });
      return;
    }

    addToCart(product);
    setMessage({ type: 'success', text: `${product.name} added to cart` });
    setScanCode('');
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(
        cart.map((item) =>
          item.product_id === productId ? { ...item, quantity: newQuantity } : item
        )
      );
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.product_id !== productId));
  };

  const getTotalAmount = () => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  const openReceipt = (transactionId) => {
    if (!transactionId) return;
    window.open(`/receipt/${transactionId}`, '_blank', 'noopener,noreferrer');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setMessage({ type: 'error', text: 'Cart is empty' });
      return;
    }

    if (paymentMethod === 'mpesa' && (!customerPhone || customerPhone.length < 10)) {
      setMessage({ type: 'error', text: 'Please enter a valid phone number' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await axios.post(
        `${API_URL}/transactions/checkout`,
        {
          customer_phone: paymentMethod === 'mpesa' ? customerPhone : '',
          payment_method: paymentMethod,
          items: cart,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessage(
        paymentMethod === 'mpesa'
          ? {
              type: 'success',
              text: 'M-Pesa prompt sent. Waiting for customer payment...',
            }
          : {
              type: 'success',
              text: 'Cash sale completed successfully.',
            }
      );

      if (paymentMethod === 'cash') {
        openReceipt(response.data?.transaction_id);
      }

      const clearDelayMs = paymentMethod === 'mpesa' ? 5000 : 1200;
      setTimeout(() => {
        setCart([]);
        setCustomerPhone('');
        setMessage({ type: '', text: '' });
      }, clearDelayMs);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to process checkout',
      });
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    'all',
    ...Array.from(
      new Set(
        products
          .map((product) => (product.category || '').trim())
          .filter((category) => category.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b)),
  ];

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      activeCategory === 'all' || (product.category || '').trim() === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="pos-checkout">
      <div className="products-section">
        <h2>Products</h2>
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <form className="scan-form" onSubmit={handleScanSubmit}>
          <input
            type="text"
            placeholder="Scan barcode / SKU and press Enter"
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            className="scan-input"
          />
          <button type="submit" className="scan-btn">
            Add
          </button>
        </form>
        <div className="category-tabs">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`category-tab ${activeCategory === category ? 'active' : ''}`}
              onClick={() => setActiveCategory(category)}
            >
              {category === 'all' ? 'All' : category}
            </button>
          ))}
        </div>
        <div className="products-grid">
          {filteredProducts.length === 0 ? (
            <p className="empty-products">No products found for this filter.</p>
          ) : (
            filteredProducts.map((product) => (
              <div
                key={product.id}
                className="product-card"
                onClick={() => addToCart(product)}
              >
                {product.image_url && (
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="product-image"
                  />
                )}
                <h3>{product.name}</h3>
                <p className="product-price">KSh {parseFloat(product.price).toFixed(2)}</p>
                {product.category && (
                  <span className="product-category">{product.category}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="cart-section">
        <h2>Cart</h2>
        {cart.length === 0 ? (
          <p className="empty-cart">No items in cart</p>
        ) : (
          <>
            <div className="cart-items">
              {cart.map((item) => (
                <div key={item.product_id} className="cart-item">
                  <div className="item-info">
                    <h4>{item.name}</h4>
                    <p>KSh {item.price.toFixed(2)}</p>
                  </div>
                  <div className="quantity-controls">
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="item-total">
                    KSh {(item.price * item.quantity).toFixed(2)}
                  </div>
                  <button
                    className="remove-btn"
                    onClick={() => removeFromCart(item.product_id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="cart-total">
              <h3>Total: KSh {getTotalAmount().toFixed(2)}</h3>
            </div>

            <div className="checkout-form">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="payment-method-select"
              >
                <option value="mpesa">M-Pesa</option>
                <option value="cash">Cash</option>
              </select>
              {paymentMethod === 'mpesa' && (
                <input
                  type="tel"
                  placeholder="Customer M-Pesa Number (e.g., 0712345678)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="phone-input"
                />
              )}
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="btn-checkout"
              >
                {loading
                  ? 'Processing...'
                  : paymentMethod === 'mpesa'
                  ? 'Send M-Pesa Prompt'
                  : 'Complete Cash Sale'}
              </button>
            </div>

            {message.text && (
              <div className={`message ${message.type}`}>{message.text}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default POSCheckout;
