import React, { useEffect, useState, useCallback } from 'react'; // 1. Added useCallback
import axios from 'axios';
import './StaffManagement.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function StaffManagement({ token }) {
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'cashier',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  // 2. Wrap fetchUsers in useCallback to prevent infinite re-renders
  const fetchUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(response.data);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to load staff',
      });
    }
  }, [token]); // token is a dependency here

  // 3. Add fetchUsers to the dependency array
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const resetForm = () => {
    setFormData({ username: '', password: '', role: 'cashier' });
    setShowPassword(false);
    setEditingUserId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      if (editingUserId) {
        const payload = {
          username: formData.username,
          role: formData.role,
        };
        if (formData.password) {
          payload.password = formData.password;
        }

        await axios.put(`${API_URL}/auth/users/${editingUserId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessage({ type: 'success', text: 'Staff account updated' });
      } else {
        await axios.post(`${API_URL}/auth/users`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessage({ type: 'success', text: 'Staff account created' });
      }

      resetForm();
      fetchUsers();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to save staff account',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (member) => {
    setEditingUserId(member.id);
    setFormData({
      username: member.username,
      password: '',
      role: member.role,
    });
  };

  const handleDelete = async (member) => {
    if (!window.confirm(`Delete user "${member.username}"?`)) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/auth/users/${member.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage({ type: 'success', text: 'Staff account deleted' });
      if (editingUserId === member.id) {
        resetForm();
      }
      fetchUsers();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to delete staff account',
      });
    }
  };

  return (
    <div className="staff-management">
      <h2>Staff Accounts</h2>

      {message.text && <div className={`message ${message.type}`}>{message.text}</div>}

      <form className="staff-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          required
        />
        <div className="password-input-wrapper">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder={editingUserId ? 'New Password (optional)' : 'Temporary Password'}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required={!editingUserId}
          />
        </div>
        <label className="show-password-label">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />
          Show password
        </label>
        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
        >
          <option value="cashier">Cashier</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : editingUserId ? 'Update Staff Account' : 'Create Staff Account'}
        </button>
        {editingUserId && (
          <button
            type="button"
            className="btn-secondary"
            onClick={resetForm}
          >
            Cancel Edit
          </button>
        )}
      </form>

      <table className="staff-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((member) => (
            <tr key={member.id}>
              <td>{member.username}</td>
              <td>{member.role}</td>
              <td>{new Date(member.created_at).toLocaleString()}</td>
              <td className="staff-actions">
                <button
                  className="btn-edit"
                  type="button"
                  onClick={() => handleEdit(member)}
                >
                  Edit
                </button>
                <button
                  className="btn-delete"
                  type="button"
                  onClick={() => handleDelete(member)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default StaffManagement;