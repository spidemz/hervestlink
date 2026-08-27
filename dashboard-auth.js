(() => {
  const password = 'HarvestLinkStaff2026!';
  const sessionKey = 'harvestlink-staff-access';
  const page = document.title.startsWith('Admin') ? 'Admin' : document.title.startsWith('Farmer') ? 'Farmer' : 'Transport';

  document.documentElement.classList.add('auth-locked');
  const initialize = () => {
    let gate = document.getElementById('staffGate');
    const form = document.getElementById('staffLoginForm');
    const error = document.getElementById('staffLoginError');
    const shell = document.querySelector('.admin-shell, .transport-shell, .farmer-shell');
    if (!gate && shell) {
      gate = document.createElement('section');
      gate.className = 'staff-gate';
      gate.id = 'staffGate';
      gate.innerHTML = '<form id="staffLoginForm"><p class="eyebrow">HarvestLink staff</p><h1>Staff access</h1><p>Enter the staff password to open this dashboard.</p><label for="staffPassword">Password</label><input id="staffPassword" type="password" required autocomplete="current-password"><p id="staffLoginError" class="staff-login-error" hidden></p><button class="btn btn-green" type="submit">Open dashboard</button></form>';
      shell.before(gate);
    }
    const loginForm = document.getElementById('staffLoginForm');
    const loginError = document.getElementById('staffLoginError');
    const unlock = () => {
      document.documentElement.classList.remove('auth-locked');
      document.documentElement.classList.add('auth-unlocked');
      gate.hidden = true;
      shell.hidden = false;
    };

    if (!gate || !loginForm || !shell) return;
    if (sessionStorage.getItem(sessionKey) === 'true') unlock();
    loginForm.addEventListener('submit', event => {
      event.preventDefault();
      if (document.getElementById('staffPassword').value === password) {
        sessionStorage.setItem(sessionKey, 'true');
        loginError.hidden = true;
        unlock();
      } else {
        loginError.textContent = 'Incorrect staff password.';
        loginError.hidden = false;
      }
    });
    let logout = document.getElementById('staffLogout');
    if (!logout) {
      logout = document.createElement('button');
      logout.className = 'staff-logout';
      logout.id = 'staffLogout';
      logout.type = 'button';
      logout.textContent = 'Log out';
      document.body.append(logout);
    }
    logout.addEventListener('click', () => {
      sessionStorage.removeItem(sessionKey);
      location.reload();
    });
    gate.querySelector('h1').textContent = `${page} staff access`;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
