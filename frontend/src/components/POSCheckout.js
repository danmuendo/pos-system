import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './POSCheckout.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const UNIT_LABELS = {
  item: 'pcs',
  kg: 'kg',
  gram: 'g',
  litre: 'L',
  ml: 'ml',
};

const getUnitLabel = (unit) => UNIT_LABELS[unit] || 'pcs';

const formatQty = (qty, unit) => {
  const n = Number(qty);
  if (unit === 'item') return String(Math.round(n));
  return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/0+$/, '');
};

function POSCheckout({ token }) {
  const scanInputRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mpesa');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [scanCode, setScanCode] = useState('');
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState('');

  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  const focusScanner = () => {
    window.requestAnimationFrame(() => {
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    });
  };

  const addToCart = (product) => {
    const unit = product.unit || 'item';
    const defaultQty = 1;
    const existingItem = cart.find((item) => item.product_id === product.id);

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + defaultQty }
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
          unit,
          quantity: defaultQty,
        },
      ]);
    }
  };

  const clearCart = () => {
    setCart([]);
    setCustomerPhone('');
    setDiscountValue('');
    setMessage({ type: '', text: '' });
    focusScanner();
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
    focusScanner();
  };

  const updateQuantity = (productId, newQuantity) => {
    const qty = Number(newQuantity);
    if (isNaN(qty) || qty <= 0) {
      removeFromCart(productId);
    } else {
      setCart(
        cart.map((item) =>
          item.product_id === productId ? { ...item, quantity: qty } : item
        )
      );
    }
  };

  const addQuickWeight = (productId, amount) => {
    setCart(
      cart.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: Math.max(0, Number((item.quantity + amount).toFixed(3))) }
          : item
      )
    );
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.product_id !== productId));
    focusScanner();
  };

  const getSubtotal = () =>
    cart.reduce((total, item) => total + item.price * item.quantity, 0);

  const getDiscountAmount = () => {
    const subtotal = getSubtotal();
    const val = Number(discountValue) || 0;
    if (val <= 0) return 0;
    if (discountType === 'percent') return Math.min((subtotal * val) / 100, subtotal);
    return Math.min(val, subtotal);
  };

  const getTotalAmount = () => getSubtotal() - getDiscountAmount();

  const getCartUnits = () =>
    cart.reduce((total, item) => total + Number(item.quantity || 0), 0);

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
          discount_amount: getDiscountAmount(),
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
        clearCart();
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
      <section className="products-section">
        <div className="pos-panel-header">
          <div>
            <h2>Live Checkout</h2>
            <p className="panel-copy">
              Keep the shelf tight, scan fast, tap once to add.
            </p>
          </div>
          <div className="panel-stats">
            <div className="panel-stat">
              <span>Visible</span>
              <strong>{filteredProducts.length}</strong>
            </div>
            <div className="panel-stat">
              <span>Categories</span>
              <strong>{Math.max(categories.length - 1, 0)}</strong>
            </div>
          </div>
        </div>

        <div className="pos-toolbar">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <form className="scan-form" onSubmit={handleScanSubmit}>
            <input
              ref={scanInputRef}
              type="text"
              placeholder="Scan barcode / SKU"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              className="scan-input"
            />
            <button type="submit" className="scan-btn">
              Scan
            </button>
          </form>
        </div>

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
              <button
                key={product.id}
                type="button"
                className="product-card"
                onClick={() => addToCart(product)}
              >
                <div className="product-card-main">
                  <div className="product-thumb">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="product-image"
                      />
                    ) : (
                      <span className="product-thumb-fallback">
                        {product.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="product-meta">
                    <h3>{product.name}</h3>
                    <p className="product-subtitle">
                      {product.category || 'Uncategorized'}
                    </p>
                    <div className="product-price-row">
                      <strong className="product-price">
                        KSh {parseFloat(product.price).toFixed(2)}
                      </strong>
                      <span className="product-unit">
                        / {getUnitLabel(product.unit || 'item')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="product-card-footer">
                  <span className="product-stock">
                    Stock {formatQty(product.stock_quantity || 0, product.unit || 'item')}
                  </span>
                  <span className="product-add">Add</span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <aside className="cart-section">
        <div className="cart-header">
          <div>
            <h2>Cart</h2>
            <p className="panel-copy">
              {cart.length} line item(s), {formatQty(getCartUnits(), 'kg')} total units selected
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary cart-clear-btn"
            onClick={clearCart}
            disabled={cart.length === 0}
          >
            Clear
          </button>
        </div>

        {cart.length === 0 ? (
          <p className="empty-cart">Scan or tap products to build the sale.</p>
        ) : (
          <>
            <div className="cart-items">
              {cart.map((item) => (
                <div key={item.product_id} className="cart-item">
                  <div className="cart-item-head">
                    <div className="item-info">
                      <h4>{item.name}</h4>
                      <p>
                        KSh {item.price.toFixed(2)} / {getUnitLabel(item.unit)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeFromCart(item.product_id)}
                    >
                      x
                    </button>
                  </div>

                  {item.unit !== 'item' ? (
                    <div className="cart-item-body decimal">
                      <div className="qty-input-row">
                        <button type="button" onClick={() => addQuickWeight(item.product_id, -0.25)}>
                          -0.25
                        </button>
                        <button type="button" onClick={() => addQuickWeight(item.product_id, -0.5)}>
                          -0.50
                        </button>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(item.product_id, parseFloat(e.target.value) || 0)
                          }
                          className="qty-decimal-input"
                        />
                        <button type="button" onClick={() => addQuickWeight(item.product_id, 0.25)}>
                          +0.25
                        </button>
                        <button type="button" onClick={() => addQuickWeight(item.product_id, 0.5)}>
                          +0.50
                        </button>
                      </div>
                      <div className="quick-weight-row">
                        <button type="button" onClick={() => updateQuantity(item.product_id, 0.25)}>
                          0.25 {getUnitLabel(item.unit)}
                        </button>
                        <button type="button" onClick={() => updateQuantity(item.product_id, 0.5)}>
                          0.50 {getUnitLabel(item.unit)}
                        </button>
                        <button type="button" onClick={() => updateQuantity(item.product_id, 1)}>
                          1 {getUnitLabel(item.unit)}
                        </button>
                        <button type="button" onClick={() => updateQuantity(item.product_id, 2)}>
                          2 {getUnitLabel(item.unit)}
                        </button>
                      </div>
                      <div className="cart-line-footer">
                        <span className="qty-label">
                          {formatQty(item.quantity, item.unit)} {getUnitLabel(item.unit)}
                        </span>
                        <strong className="item-total">
                          KSh {(item.price * item.quantity).toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="cart-item-body">
                      <div className="quantity-controls">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                        >
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                      <strong className="item-total">
                        KSh {(item.price * item.quantity).toFixed(2)}
                      </strong>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="cart-footer">
              <div className="cart-total">
                <div className="discount-row">
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="discount-type-select"
                  >
                    <option value="percent">% Discount</option>
                    <option value="fixed">Fixed (KSh)</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step={discountType === 'percent' ? '1' : '0.01'}
                    max={discountType === 'percent' ? '100' : undefined}
                    placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="discount-input"
                  />
                </div>

                {getDiscountAmount() > 0 && (
                  <div className="subtotal-line">
                    <span>Subtotal</span>
                    <span>KSh {getSubtotal().toFixed(2)}</span>
                  </div>
                )}
                {getDiscountAmount() > 0 && (
                  <div className="discount-line">
                    <span>Discount</span>
                    <span>-KSh {getDiscountAmount().toFixed(2)}</span>
                  </div>
                )}

                <div className="grand-total">
                  <span>Total</span>
                  <strong>KSh {getTotalAmount().toFixed(2)}</strong>
                </div>
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
                    placeholder="Customer M-Pesa Number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="phone-input"
                  />
                )}
                <button
                  type="button"
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
            </div>

            {message.text && (
              <div className={`message ${message.type}`}>{message.text}</div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

export default POSCheckout;
