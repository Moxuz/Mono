async function init() {
    // Authentication is provided by the server-side session cookie.
    const res  = await fetch('/api/session');
    const data = await res.json();

    if (!data.authenticated) {
        window.location.href = '/login';
        return;
    }

    const u = data.user;
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    document.getElementById('welcomeCard').innerHTML = `
        <h2>Welcome, ${escapeHtml(u.username)}! 👋</h2>
        <p style="margin-top:8px; color:#64748b;">${escapeHtml(u.email)}</p>
    `;

}

init();
