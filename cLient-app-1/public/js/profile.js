async function init() {
    const res  = await fetch('/api/session');
    const data = await res.json();

    if (!data.authenticated) {
        window.location.href = '/login';
        return;
    }

    const u = data.user;
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    document.getElementById('profileCard').innerHTML = `
        <h2>👤 ${escapeHtml(u.username)}</h2>
        <p style="margin-top:12px;"><strong>Email:</strong> ${escapeHtml(u.email)}</p>
    `;
}

init();
