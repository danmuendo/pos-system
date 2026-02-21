import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ProductManagement.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function ProductManagement({ token, user }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    description: '',
    price: '',
    cost_price: '',
    stock_quantity: '',
    reorder_point: '',
    unit: 'item',
    category_id: '',
    image_url: '',
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustmentData, setAdjustmentData] = useState({ adjustment: '', reason: '' });
  const [adjusting, setAdjusting] = useState(false);
  const canManageProducts = user?.role === 'owner' || user?.role === 'manager';

  useEffect(() => {
    fetchProducts();
    fetchCategories();
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

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/products/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      setMessage({ type: 'error', text: 'Enter category name first' });
      return;
    }

    setCreatingCategory(true);
    try {
      const response = await axios.post(
        `${API_URL}/products/categories`,
        { name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchCategories();
      setFormData((prev) => ({ ...prev, category_id: String(response.data.id) }));
      setNewCategoryName('');
      setMessage({ type: 'success', text: 'Category ready for use' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to create category',
      });
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManageProducts) {
      setMessage({ type: 'error', text: 'Only owner/admin can modify products' });
      return;
    }
    setUploading(true);

    try {
      let imageUrl = formData.image_url;
      
      // Upload image if selected
      if (imageFile) {
        const imageFormData = new FormData();
        imageFormData.append('image', imageFile);
        
        const uploadResponse = await axios.post(
          `${API_URL}/products/upload-image`,
          imageFormData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );
        
        // Cloudinary returns the full URL directly
        imageUrl = uploadResponse.data.image_url;
      }
      
      const productData = {
        ...formData,
        category_id: formData.category_id || null,
        reorder_point: formData.reorder_point !== '' ? Number(formData.reorder_point) : null,
        image_url: imageUrl,
      };

      if (editingProduct) {
        await axios.put(`${API_URL}/products/${editingProduct.id}`, productData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessage({ type: 'success', text: 'Product updated successfully' });
      } else {
        await axios.post(`${API_URL}/products`, productData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessage({ type: 'success', text: 'Product added successfully' });
      }

      fetchProducts();
      fetchCategories();
      resetForm();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to save product',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAdjustStock = async () => {
    const adj = Number(adjustmentData.adjustment);
    if (!adjustmentData.adjustment || isNaN(adj) || adj === 0) {
      setMessage({ type: 'error', text: 'Enter a non-zero adjustment amount' });
      return;
    }
    if (!adjustmentData.reason.trim()) {
      setMessage({ type: 'error', text: 'Reason is required' });
      return;
    }
    setAdjusting(true);
    try {
      await axios.post(
        `${API_URL}/products/${adjustingProduct.id}/adjust-stock`,
        { adjustment: adj, reason: adjustmentData.reason.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage({ type: 'success', text: `Stock adjusted for ${adjustingProduct.name}` });
      setAdjustingProduct(null);
      setAdjustmentData({ adjustment: '', reason: '' });
      fetchProducts();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to adjust stock' });
    } finally {
      setAdjusting(false);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      description: product.description || '',
      price: product.price,
      cost_price: product.cost_price || '',
      stock_quantity: product.stock_quantity,
      reorder_point: product.reorder_point != null ? String(product.reorder_point) : '',
      unit: product.unit || 'item',
      category_id: product.category_id ? String(product.category_id) : '',
      image_url: product.image_url || '',
    });
    if (product.image_url) {
      setImagePreview(product.image_url);
    }
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return;
    }
    if (!canManageProducts) {
      setMessage({ type: 'error', text: 'Only owner/admin can delete products' });
      return;
    }

    try {
      await axios.delete(`${API_URL}/products/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage({ type: 'success', text: 'Product deleted successfully' });
      fetchProducts();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to delete product',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      barcode: '',
      description: '',
      price: '',
      cost_price: '',
      stock_quantity: '',
      reorder_point: '',
      unit: 'item',
      category_id: '',
      image_url: '',
    });
    setNewCategoryName('');
    setImageFile(null);
    setImagePreview(null);
    setEditingProduct(null);
    setShowForm(false);
  };

  const getStockStatus = (quantity) => {
    if (quantity === 0) return 'out-of-stock';
    if (quantity <= 5) return 'critical-stock';
    if (quantity <= 10) return 'low-stock';
    return 'in-stock';
  };

  const getStockLabel = (quantity) => {
    if (quantity === 0) return 'Out of Stock';
    if (quantity <= 5) return 'Critical';
    if (quantity <= 10) return 'Low';
    return 'In Stock';
  };

  return (
    <div className="product-management">
      <div className="section-header">
        <h2>Product Management</h2>
        {canManageProducts ? (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            {showForm ? 'Cancel' : 'Add Product'}
          </button>
        ) : (
          <span className="permission-note">Read-only for cashier role</span>
        )}
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      {showForm && canManageProducts && (
        <form onSubmit={handleSubmit} className="product-form">
          <div className="form-row">
            <input
              type="text"
              name="name"
              placeholder="Product Name"
              value={formData.name}
              onChange={handleChange}
              required
            />
            <input
              type="text"
              name="barcode"
              placeholder="Barcode / SKU (optional)"
              value={formData.barcode}
              onChange={handleChange}
            />
          </div>

          <div className="form-row">
            <select
              name="category_id"
              value={formData.category_id}
              onChange={handleChange}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row category-create-row">
            <input
              type="text"
              placeholder="New category (e.g., Milk)"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCreateCategory}
              disabled={creatingCategory}
            >
              {creatingCategory ? 'Adding...' : 'Add Category'}
            </button>
          </div>

          <textarea
            name="description"
            placeholder="Description"
            value={formData.description}
            onChange={handleChange}
            rows="3"
          />

          <div className="image-upload-section">
            {imagePreview && (
              <img src={imagePreview} alt="Preview" className="image-preview" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="file-input"
            />
            <small>Upload product image (Max 5MB - JPG, PNG, GIF, WebP)</small>
          </div>

          <div className="form-row">
            <input
              type="number"
              name="price"
              placeholder="Price (KSh)"
              value={formData.price}
              onChange={handleChange}
              step="0.01"
              min="0"
              required
            />
            <input
              type="number"
              name="cost_price"
              placeholder="Cost Price (KSh) - optional"
              value={formData.cost_price}
              onChange={handleChange}
              step="0.01"
              min="0"
            />
          </div>

          <div className="form-row">
            <select
              name="unit"
              value={formData.unit}
              onChange={handleChange}
            >
              <option value="item">Item (piece/unit)</option>
              <option value="kg">Kilogram (kg)</option>
              <option value="gram">Gram (g)</option>
              <option value="litre">Litre (L)</option>
              <option value="ml">Millilitre (ml)</option>
            </select>
            <input
              type="number"
              name="stock_quantity"
              placeholder={`Stock Quantity (${formData.unit === 'item' ? 'pieces' : formData.unit})`}
              value={formData.stock_quantity}
              onChange={handleChange}
              step={formData.unit === 'item' ? '1' : '0.001'}
              min="0"
              required
            />
          </div>

          <div className="form-row">
            <input
              type="number"
              name="reorder_point"
              placeholder="Low stock alert threshold (optional, default 10)"
              value={formData.reorder_point}
              onChange={handleChange}
              min="0"
              step="1"
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={uploading}>
              {uploading ? 'Uploading...' : editingProduct ? 'Update Product' : 'Add Product'}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="products-table">
        <table>
          <thead>
            <tr>
              <th>Image</th>
              <th>Name</th>
              <th>Barcode</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Cost</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name}
                      className="product-thumbnail"
                    />
                  ) : (
                    <div className="no-image">No image</div>
                  )}
                </td>
                <td>{product.name}</td>
                <td>{product.barcode || '-'}</td>
                <td>{product.category || '-'}</td>
                <td>{product.unit === 'item' ? 'Item' : product.unit || 'Item'}</td>
                <td>KSh {parseFloat(product.price).toFixed(2)}{product.unit && product.unit !== 'item' ? `/${product.unit}` : ''}</td>
                <td>
                  {product.cost_price !== null && product.cost_price !== undefined
                    ? `KSh ${parseFloat(product.cost_price).toFixed(2)}`
                    : '-'}
                </td>
                <td>
                  <span className={`stock-quantity ${getStockStatus(product.stock_quantity)}`}>
                    {Number(product.stock_quantity) % 1 === 0
                      ? Number(product.stock_quantity)
                      : Number(product.stock_quantity).toFixed(3).replace(/0+$/, '')}
                    {product.unit && product.unit !== 'item' ? ` ${product.unit}` : ''}
                  </span>
                </td>
                <td>
                  <span className={`stock-badge ${getStockStatus(product.stock_quantity)}`}>
                    {getStockLabel(product.stock_quantity)}
                  </span>
                </td>
                <td>
                  {canManageProducts ? (
                    <>
                      <button onClick={() => handleEdit(product)} className="btn-edit">
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setAdjustingProduct(product);
                          setAdjustmentData({ adjustment: '', reason: '' });
                        }}
                        className="btn-adjust"
                      >
                        Adjust Stock
                      </button>
                      {user?.role === 'owner' && (
                        <button onClick={() => handleDelete(product.id)} className="btn-delete">
                          Delete
                        </button>
                      )}
                    </>
                  ) : (
                    <span>-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stock Adjustment Modal */}
      {adjustingProduct && (
        <div className="modal-overlay" onClick={() => setAdjustingProduct(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Adjust Stock — {adjustingProduct.name}</h3>
              <button className="close-btn" onClick={() => setAdjustingProduct(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="current-stock">
                Current stock:{' '}
                <strong>
                  {Number(adjustingProduct.stock_quantity) % 1 === 0
                    ? Number(adjustingProduct.stock_quantity)
                    : Number(adjustingProduct.stock_quantity).toFixed(3).replace(/0+$/, '')}
                  {adjustingProduct.unit && adjustingProduct.unit !== 'item' ? ` ${adjustingProduct.unit}` : ''}
                </strong>
              </p>
              <div className="form-row">
                <input
                  type="number"
                  placeholder="Adjustment (e.g. +20 to add, -5 to remove)"
                  value={adjustmentData.adjustment}
                  onChange={(e) => setAdjustmentData((prev) => ({ ...prev, adjustment: e.target.value }))}
                  step={adjustingProduct.unit === 'item' ? '1' : '0.001'}
                />
              </div>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Reason (e.g. new stock received, damaged goods)"
                  value={adjustmentData.reason}
                  onChange={(e) => setAdjustmentData((prev) => ({ ...prev, reason: e.target.value }))}
                />
              </div>
              {adjustmentData.adjustment !== '' && !isNaN(Number(adjustmentData.adjustment)) && (
                <p className="adjustment-preview">
                  New stock will be:{' '}
                  <strong>
                    {(Number(adjustingProduct.stock_quantity) + Number(adjustmentData.adjustment)).toFixed(
                      adjustingProduct.unit === 'item' ? 0 : 3
                    ).replace(/\.?0+$/, '')}
                    {adjustingProduct.unit && adjustingProduct.unit !== 'item' ? ` ${adjustingProduct.unit}` : ''}
                  </strong>
                </p>
              )}
              <div className="form-actions">
                <button className="btn-primary" onClick={handleAdjustStock} disabled={adjusting}>
                  {adjusting ? 'Saving...' : 'Save Adjustment'}
                </button>
                <button className="btn-secondary" onClick={() => setAdjustingProduct(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductManagement;
