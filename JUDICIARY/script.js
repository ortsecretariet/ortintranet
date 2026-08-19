const API = (function () {
  if (window.location.protocol === 'file:') {
    return 'http://localhost:3000/api';
  }
  return `${window.location.protocol}//${window.location.host}/api`;
})();

// Password visibility toggle
const toggleBtn = document.getElementById('toggle-visibility');
const pwField   = document.getElementById('password');
const eyeIcon   = document.getElementById('eye-icon');

toggleBtn.addEventListener('click', () => {
  const hidden = pwField.type === 'password';
  pwField.type = hidden ? 'text' : 'password';
  toggleBtn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
  eyeIcon.innerHTML = hidden
    ? '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>';
});

// Login form
const form   = document.getElementById('signin-form');
const status = document.getElementById('status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user_id  = document.getElementById('staff-id').value.trim();
  const password = pwField.value;

  if (!user_id || !password) {
    status.style.color = '#8A2C2C';
    status.textContent = 'Enter both your staff ID and password to continue.';
    return;
  }

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  status.style.color = '#1E6B44';
  status.textContent = 'Signing in…';

  try {
    const res  = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_id, password })
    });
    const data = await res.json();

    if (!res.ok) {
      status.style.color = '#8A2C2C';
      status.textContent = data.error || 'Login failed.';
      btn.disabled = false;
      return;
    }

    // Store user info for the dashboard
    localStorage.setItem('user', JSON.stringify(data.user));
    status.textContent = `Welcome back, ${data.user.full_name.split(' ')[0]}! Redirecting…`;

    // Redirect to dashboard
    setTimeout(() => {
      if (window.location.protocol === 'file:') {
        window.location.href = '../dashboard2/dashboard.html';
      } else {
        window.location.href = '/dashboard.html';
      }
    }, 800);

  } catch {
    status.style.color = '#8A2C2C';
    status.textContent = 'Could not reach the server. Is the backend running?';
    btn.disabled = false;
  }
});

document.getElementById('forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('forgot-panel').style.display = 'block';
  document.getElementById('reset-staff-id').focus();
});

document.getElementById('forgot-cancel').addEventListener('click', () => {
  document.getElementById('forgot-panel').style.display = 'none';
  document.getElementById('forgot-form').reset();
  document.getElementById('forgot-status').textContent = '';
});

document.getElementById('forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user_id = document.getElementById('reset-staff-id').value.trim();
  const email   = document.getElementById('reset-email').value.trim();
  const fStatus = document.getElementById('forgot-status');
  const btn     = e.target.querySelector('button[type=submit]');

  if (!user_id || !email) {
    fStatus.style.color = '#8A2C2C';
    fStatus.textContent = 'Please enter both your Staff ID and email.';
    return;
  }

  btn.disabled = true;
  fStatus.style.color = '#1E6B44';
  fStatus.textContent = 'Sending reset link…';

  try {
    const res  = await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, email })
    });
    const data = await res.json();
    fStatus.style.color = '#1E6B44';
    fStatus.textContent = data.message || 'Reset link sent. Check your email.';
  } catch {
    fStatus.style.color = '#8A2C2C';
    fStatus.textContent = 'Could not reach the server.';
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('disclaimer-link').addEventListener('click', (e) => {
  e.preventDefault();
  alert('This is an internal system for authorised tribunal staff only. Unauthorised access is prohibited.');
});
