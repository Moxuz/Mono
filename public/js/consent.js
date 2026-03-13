console.log('Consent page loaded');

// ─── Scope descriptions ───────────────────────────────────────────
const SCOPE_DESCRIPTIONS = {
    openid:         'Verify your identity',
    profile:        'Access your basic profile information',
    email:          'Access your email address',
    offline_access: 'Stay signed in (refresh token)',
    read:           'Read your data',
    write:          'Modify your data'
};

let alertTimeout = null;

// ─── Init ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function () {
    console.log('Consent DOM loaded');

    // 1) โหลด params จาก URL
    const params = new URLSearchParams(window.location.search);

    const clientName          = params.get('client_name')          || 'Unknown App';
    const clientId            = params.get('client_id')            || '';
    const redirectUri         = params.get('redirect_uri')         || '';
    const responseType        = params.get('response_type')        || 'code';
    const scope               = params.get('scope')                || 'openid profile email';
    const state               = params.get('state')                || '';
    const codeChallenge       = params.get('code_challenge')       || '';
    const codeChallengeMethod = params.get('code_challenge_method')|| 'S256';
    const mode                = params.get('mode')                 || 'login';
    const userEmail           = params.get('user_email')           || '';

    console.log('Mode:', mode);
    console.log('Client:', clientId);

    // 2) ใส่ข้อมูลลงหน้า
    document.getElementById('clientName').textContent = clientName;
    document.title = `Authorize ${clientName}`;

    // hidden fields
    document.getElementById('client_id').value             = clientId;
    document.getElementById('redirect_uri').value          = redirectUri;
    document.getElementById('response_type').value         = responseType;
    document.getElementById('scope').value                 = scope;
    document.getElementById('state').value                 = state;
    document.getElementById('code_challenge').value        = codeChallenge;
    document.getElementById('code_challenge_method').value = codeChallengeMethod;

    // PKCE badge
    if (codeChallenge) {
        document.getElementById('pkceBadge').style.display = 'inline-block';
    }

    // 3) แสดง scope items
    const scopeItems = scope.split(' ').map(s => {
        const desc = SCOPE_DESCRIPTIONS[s] || s;
        return `<div class="permission-item">${desc}</div>`;
    }).join('');
    document.getElementById('scopeItems').innerHTML = scopeItems;

    // 4) mode: login หรือ consent
    if (mode === 'login') {
        // ยังไม่ login → แสดง login fields
        document.getElementById('loginFields').classList.add('show');
        const emailInput = document.getElementById('email');
        if (emailInput) emailInput.focus();
    } else {
        // login แล้ว → แสดง badge
        document.getElementById('loggedInBadge').style.display = 'block';
        document.getElementById('loggedInEmail').textContent   = userEmail;
    }

    // 5) attach events
    document.getElementById('consentForm').addEventListener('submit', handleApprove);
    document.getElementById('btnDeny').addEventListener('click', handleDeny);

    console.log('Consent page ready');
});

// ─── Approve ──────────────────────────────────────────────────────
async function handleApprove(e) {
    e.preventDefault();
    console.log('Approve clicked');

    const btn = document.getElementById('btnApprove');
    btn.disabled    = true;
    btn.textContent = 'Authorizing...';

    // validate login fields ถ้าอยู่ใน login mode
    const loginFields = document.getElementById('loginFields');
    if (loginFields.classList.contains('show')) {
        const email    = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        if (!email || !password) {
            showAlert('Please enter your email and password', 'error');
            btn.disabled    = false;
            btn.textContent = '✅ Approve & Continue';
            return;
        }
    }

    const formData = new FormData(e.target);
    const data     = Object.fromEntries(formData);
    data.action    = 'approve';

    try {
        const response = await fetch('/api/oauth/authorize', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data)
        });

        const result = await response.json();
        console.log('Authorize result:', result);

        if (result.redirect_url) {
            showAlert('Authorization successful! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = result.redirect_url;
            }, 500);
            return;
        }

        showAlert(result.error || 'Authorization failed', 'error');

    } catch (err) {
        console.error('Authorize error:', err);
        showAlert('Network error. Please try again.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = '✅ Approve & Continue';
    }
}

// ─── Deny ─────────────────────────────────────────────────────────
async function handleDeny() {
    console.log('Deny clicked');

    const formData = new FormData(document.getElementById('consentForm'));
    const data     = Object.fromEntries(formData);
    data.action    = 'deny';

    try {
        const response = await fetch('/api/oauth/authorize', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data)
        });

        const result = await response.json();
        window.location.href = result.redirect_url;

    } catch (err) {
        console.error('Deny error:', err);
        const redirectUri = document.getElementById('redirect_uri').value;
        const state       = document.getElementById('state').value;
        window.location.href = `${redirectUri}?error=access_denied` +
            `${state ? `&state=${encodeURIComponent(state)}` : ''}`;
    }
}

// ─── Alert ────────────────────────────────────────────────────────
function showAlert(message, type) {
    const el = document.getElementById('alert');

    if (alertTimeout) {
        clearTimeout(alertTimeout);
        alertTimeout = null;
    }

    el.textContent   = message;
    el.className     = `alert alert-${type}`;
    el.style.display = 'block';

    alertTimeout = setTimeout(() => {
        el.style.display = 'none';
        alertTimeout     = null;
    }, 5000);
}