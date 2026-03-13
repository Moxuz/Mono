async function init() {
    const token = await SilentAuth.ensureValidToken();
    if (!token) return;

    const res  = await fetch('/api/session');
    const data = await res.json();

    if (!data.authenticated) {
        window.location.href = '/login';
        return;
    }

    const u = data.user;
    document.getElementById('profileCard').innerHTML = `
        <h2>👤 ${u.username}</h2>
        <p style="margin-top:12px;"><strong>Email:</strong> ${u.email}</p>
        <p style="margin-top:8px;">
            <strong>Email Verified:</strong> ${u.email_verified ? '✅' : '❌'}
        </p>
        <p style="margin-top:8px;"><strong>Role:</strong> ${u.role || 'user'}</p>
    `;
}

init();