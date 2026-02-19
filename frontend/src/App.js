import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ReceiptPrint from './components/ReceiptPrint';
import './App.css';

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

function App() {
  const [token, setToken] = useState(
    sessionStorage.getItem('token') || localStorage.getItem('token')
  );
  const [user, setUser] = useState(
    JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || 'null')
  );

  const handleLogin = (userData, authToken) => {
    setToken(authToken);
    setUser(userData);
    sessionStorage.setItem('token', authToken);
    sessionStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  useEffect(() => {
    if (!token) return undefined;

    let timeoutId;
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
      }, SESSION_TIMEOUT_MS);
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => window.addEventListener(event, resetTimeout));
    resetTimeout();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimeout));
    };
  }, [token]);

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route
            path="/login"
            element={
              token ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />
            }
          />
          <Route
            path="/dashboard"
            element={
              token ? (
                <Dashboard user={user} token={token} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/receipt/:id"
            element={token ? <ReceiptPrint token={token} /> : <Navigate to="/login" />}
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
