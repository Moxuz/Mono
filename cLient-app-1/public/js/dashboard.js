async function init() {
    // ✅ เช็ค + refresh token ก่อนโหลดข้อมูล
    const token = await SilentAuth.ensureValidToken();
    if (!token) return; // redirect แล้ว

    // โหลด user data
    const res  = await fetch('/api/session');
    const data = await res.json();

    if (!data.authenticated) {
        window.location.href = '/login';
        return;
    }

    const u = data.user;
    document.getElementById('welcomeCard').innerHTML = `
        <h2>Welcome, ${u.username}! 👋</h2>
        <p style="margin-top:8px; color:#64748b;">${u.email}</p>
        <p style="margin-top:4px; color:#64748b;">
            Role: <strong>${u.role || 'user'}</strong>
        </p>
    `;

    // ✅ เริ่ม auto refresh ตลอด session
    SilentAuth.startAutoRefresh();
}

init();