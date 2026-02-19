import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './AccountSettings.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const API_BASE_URL = API_URL.replace('/api', '');

function AccountSettings({ token, user }) {
  const canManageBusinessProfile = user?.role === 'owner' || user?.role === 'admin';
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [profileForm, setProfileForm] = useState({
    business_name: '',
    business_phone: '',
    business_address: '',
    business_tax_pin: '',
    business_logo_url: '',
    receipt_footer: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const resolveAssetUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${API_BASE_URL}${url}`;
  };

  useEffect(() => {
    if (canManageBusinessProfile) {
      fetchBusinessProfile();
    } else {
      setProfileLoading(false);
    }
  }, [canManageBusinessProfile]);

  const fetchBusinessProfile = async () => {
    setProfileLoading(true);
    try {
      const response = await axios.get(`${API_URL}/auth/business-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfileForm({
        business_name: response.data.business_name || '',
        business_phone: response.data.business_phone || '',
        business_address: response.data.business_address || '',
        business_tax_pin: response.data.business_tax_pin || '',
        business_logo_url: response.data.business_logo_url || '',
        receipt_footer: response.data.receipt_footer || '',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to load business profile',
      });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleProfileChange = (e) => {
    setProfileForm({
      ...profileForm,
      [e.target.name]: e.target.value,
    });
  };

  const handlePasswordChange = (e) => {
    setPasswordForm({
      ...passwordForm,
      [e.target.name]: e.target.value,
    });
  };

  const handleLogoSelection = (e) => {
    const file = e.target.files[0];
    if (file && file.size > 2 * 1024 * 1024) {
      setLogoFile(null);
      setMessage({ type: 'error', text: 'Logo must be 2MB or smaller' });
      return;
    }

    setLogoFile(file || null);
  };

  const handleLogoUpload = async () => {
    if (!logoFile) {
      setMessage({ type: 'error', text: 'Select a logo image first' });
      return;
    }

    setUploadingLogo(true);
    setMessage({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);

      const response = await axios.post(`${API_URL}/auth/upload-logo`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      setProfileForm((prev) => ({
        ...prev,
        business_logo_url: response.data.business_logo_url || prev.business_logo_url,
      }));
      setLogoFile(null);
      setMessage({ type: 'success', text: 'Business logo uploaded' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to upload logo',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoRemove = async () => {
    setUploadingLogo(true);
    setMessage({ type: '', text: '' });
    try {
      await axios.delete(`${API_URL}/auth/logo`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setProfileForm((prev) => ({ ...prev, business_logo_url: '' }));
      setLogoFile(null);
      setMessage({ type: 'success', text: 'Business logo removed' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to remove logo',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!profileForm.business_name.trim()) {
      setMessage({ type: 'error', text: 'Business name is required' });
      return;
    }

    setSavingProfile(true);
    try {
      const response = await axios.put(`${API_URL}/auth/business-profile`, profileForm, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setProfileForm({
        business_name: response.data.profile.business_name || '',
        business_phone: response.data.profile.business_phone || '',
        business_address: response.data.profile.business_address || '',
        business_tax_pin: response.data.profile.business_tax_pin || '',
        business_logo_url: response.data.profile.business_logo_url || '',
        receipt_footer: response.data.profile.receipt_footer || '',
      });

      const storedUser = JSON.parse(
        sessionStorage.getItem('user') || localStorage.getItem('user') || 'null'
      );
      if (storedUser) {
        const updatedUser = {
          ...storedUser,
          business_name: response.data.profile.business_name || storedUser.business_name,
        };
        sessionStorage.setItem('user', JSON.stringify(updatedUser));
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

      setMessage({ type: 'success', text: response.data.message || 'Business profile updated' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to update business profile',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setMessage({ type: 'error', text: 'New password and confirm password do not match' });
      return;
    }

    setChangingPassword(true);
    try {
      const response = await axios.post(
        `${API_URL}/auth/change-password`,
        {
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessage({ type: 'success', text: response.data.message || 'Password updated' });
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to change password',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="account-settings">
      <h2>Account Settings</h2>
      <p className="account-help">
        {canManageBusinessProfile
          ? 'Manage your business details and account security.'
          : 'Manage your account security.'}
      </p>

      {message.text && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className={`settings-grid ${!canManageBusinessProfile ? 'single-column' : ''}`}>
        {canManageBusinessProfile && (
          <section className="settings-section">
            <h3>Business Profile</h3>
            {profileLoading ? (
              <p>Loading business profile...</p>
            ) : (
              <form className="settings-form" onSubmit={handleProfileSubmit}>
                <input
                  type="text"
                  name="business_name"
                  placeholder="Business Name"
                  value={profileForm.business_name}
                  onChange={handleProfileChange}
                  required
                />
                <input
                  type="text"
                  name="business_phone"
                  placeholder="Business Phone"
                  value={profileForm.business_phone}
                  onChange={handleProfileChange}
                />
                <input
                  type="text"
                  name="business_tax_pin"
                  placeholder="Tax PIN / VAT Number"
                  value={profileForm.business_tax_pin}
                  onChange={handleProfileChange}
                />
                <div className="logo-upload-group">
                  {profileForm.business_logo_url && (
                    <img
                      src={resolveAssetUrl(profileForm.business_logo_url)}
                      alt="Business Logo"
                      className="business-logo-preview"
                    />
                  )}
                  <input type="file" accept="image/*" onChange={handleLogoSelection} />
                  <small>Recommended: PNG/JPG, landscape, max 2MB.</small>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleLogoUpload}
                    disabled={uploadingLogo}
                  >
                    {uploadingLogo ? 'Uploading Logo...' : 'Upload Logo'}
                  </button>
                  {profileForm.business_logo_url && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleLogoRemove}
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo ? 'Please wait...' : 'Remove Logo'}
                    </button>
                  )}
                </div>
                <textarea
                  name="business_address"
                  placeholder="Business Address"
                  rows={3}
                  value={profileForm.business_address}
                  onChange={handleProfileChange}
                />
                <textarea
                  name="receipt_footer"
                  placeholder="Receipt Footer (e.g., Thank you and return policy)"
                  rows={3}
                  value={profileForm.receipt_footer}
                  onChange={handleProfileChange}
                />
                <button className="btn-primary" type="submit" disabled={savingProfile}>
                  {savingProfile ? 'Saving...' : 'Save Business Profile'}
                </button>
              </form>
            )}
          </section>
        )}

        <section className="settings-section">
          <h3>Password</h3>
          <form className="settings-form" onSubmit={handlePasswordSubmit}>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                name="current_password"
                placeholder="Current Password"
                value={passwordForm.current_password}
                onChange={handlePasswordChange}
                required
              />
            </div>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                name="new_password"
                placeholder="New Password"
                value={passwordForm.new_password}
                onChange={handlePasswordChange}
                minLength={6}
                required
              />
            </div>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirm_password"
                placeholder="Confirm New Password"
                value={passwordForm.confirm_password}
                onChange={handlePasswordChange}
                minLength={6}
                required
              />
            </div>
            <label className="show-password-label">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show passwords
            </label>
            <button className="btn-primary" type="submit" disabled={changingPassword}>
              {changingPassword ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default AccountSettings;
