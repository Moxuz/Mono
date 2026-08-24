(function () {
    'use strict';

    const message = document.getElementById('message');
    const tbody = document.getElementById('logs');
    let page = 1;
    let pages = 1;

    function filters(includePage = true) {
        const params = new URLSearchParams();
        const mapping = {
            action: 'filterAction',
            status: 'filterStatus',
            startDate: 'filterStartDate',
            endDate: 'filterEndDate'
        };
        Object.entries(mapping).forEach(([name, id]) => {
            const value = document.getElementById(id).value;
            if (value) params.set(name, value);
        });
        if (includePage) {
            params.set('page', String(page));
            params.set('limit', '25');
        }
        return params;
    }

    function cell(row, value, className = '') {
        const node = document.createElement('td');
        if (className) node.className = className;
        node.textContent = value ?? '';
        row.appendChild(node);
    }

    function render(logs) {
        tbody.replaceChildren();
        if (!logs.length) {
            const row = document.createElement('tr');
            const empty = document.createElement('td');
            empty.colSpan = 7;
            empty.textContent = 'No matching events.';
            row.appendChild(empty);
            tbody.appendChild(row);
            return;
        }

        logs.forEach(log => {
            const row = document.createElement('tr');
            cell(row, log.createdAt ? new Date(log.createdAt).toLocaleString() : '—');
            cell(row, log.action || '—');
            cell(row, log.status || '—', log.status === 'success' ? 'success' : 'failure');
            const identity = log.userId ||
                (log.emailHash ? `email#${String(log.emailHash).slice(0, 12)}` : 'anonymous');
            cell(row, identity);
            cell(row, log.ipAddress || '—');
            cell(row, log.userAgent || '—');
            cell(row, JSON.stringify(log.metadata || {}), 'details');
            tbody.appendChild(row);
        });
    }

    async function loadLogs() {
        message.textContent = 'Loading logs…';
        const response = await fetch(`/api/dashboard/logs/security?${filters()}`, {
            credentials: 'same-origin'
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Unable to load security logs.');
        }
        pages = Math.max(1, result.data.pagination.pages || 1);
        page = Math.min(page, pages);
        render(result.data.logs || []);
        document.getElementById('pageInfo').textContent =
            `Page ${page} of ${pages} · ${result.data.pagination.total || 0} events`;
        document.getElementById('previous').disabled = page <= 1;
        document.getElementById('next').disabled = page >= pages;
        message.textContent = '';
    }

    async function loadStats() {
        const response = await fetch('/api/dashboard/logs/stats', { credentials: 'same-origin' });
        const result = await response.json();
        if (!response.ok || !result.success) return;
        document.getElementById('totalEvents').textContent = result.data.logins.last24Hours ?? 0;
        document.getElementById('successEvents').textContent = result.data.logins.successfulLast24h ?? 0;
        document.getElementById('failedEvents').textContent = result.data.logins.failedLast24h ?? 0;
        document.getElementById('lockedAccounts').textContent = result.data.security.accountLockouts24h ?? 0;
    }

    async function exportLogs() {
        const response = await fetch(`/api/dashboard/logs/export?${filters(false)}`, {
            credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('Unable to export logs.');
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'security-logs.csv';
        link.click();
        URL.revokeObjectURL(blobUrl);
    }

    function report(error) {
        message.textContent = error.message || 'Request failed.';
        message.className = 'failure';
    }

    document.getElementById('applyFilters').addEventListener('click', () => {
        page = 1;
        loadLogs().catch(report);
    });
    document.getElementById('exportLogs').addEventListener('click', () => exportLogs().catch(report));
    document.getElementById('previous').addEventListener('click', () => {
        if (page > 1) {
            page -= 1;
            loadLogs().catch(report);
        }
    });
    document.getElementById('next').addEventListener('click', () => {
        if (page < pages) {
            page += 1;
            loadLogs().catch(report);
        }
    });

    Promise.all([loadLogs(), loadStats()]).catch(report);
}());
