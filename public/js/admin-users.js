(async function () {
    const message = document.getElementById('message');
    const content = document.getElementById('content');
    const headers = {};
    let page = 1;
    let pages = 1;

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    const formatDate = (value) => value ? new Date(value).toLocaleString() : '—';

    async function verifyAdmin() {
        const response = await fetch('/api/auth/profile', { headers });
        const result = await response.json();
        if (!response.ok || !result.success || result.data?.role !== 'admin') {
            throw new Error('Admin access required.');
        }
    }

    async function loadUsers() {
        const response = await fetch(`/api/users?page=${page}&limit=20`, { headers });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Failed to load users.');

        const users = result.users || [];
        pages = result.pagination?.pages || 1;
        document.getElementById('summary').textContent = `${result.pagination?.total || 0} users`;
        document.getElementById('pageInfo').textContent = `Page ${page} of ${pages}`;
        document.getElementById('previous').disabled = page <= 1;
        document.getElementById('next').disabled = page >= pages;
        document.getElementById('users').innerHTML = users.length ? users.map(user => `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td><span class="badge">${escapeHtml(user.role)}</span></td>
                <td><span class="badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>${escapeHtml(formatDate(user.createdAt))}</td>
                <td>${escapeHtml(formatDate(user.lastLogin))}</td>
            </tr>`).join('') : '<tr><td colspan="6">No users found.</td></tr>';
    }

    try {
        await verifyAdmin();
        message.style.display = 'none';
        content.style.display = 'block';
        await loadUsers();
    } catch (error) {
        message.textContent = error.message;
        message.style.color = '#fda4af';
    }

    document.getElementById('refresh').addEventListener('click', () => loadUsers().catch(error => { message.textContent = error.message; }));
    document.getElementById('previous').addEventListener('click', () => { if (page > 1) { page -= 1; loadUsers(); } });
    document.getElementById('next').addEventListener('click', () => { if (page < pages) { page += 1; loadUsers(); } });
    document.getElementById('logout').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST', headers }).catch(() => {});
        window.location.href = '/login.html';
    });
}());
