(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const values = {
        client_id: params.get('client_id') || '',
        redirect_uri: params.get('redirect_uri') || '',
        response_type: params.get('response_type') || 'code',
        scope: params.get('scope') || '',
        state: params.get('state') || '',
        code_challenge: params.get('code_challenge') || '',
        code_challenge_method: params.get('code_challenge_method') || 'S256',
        nonce: params.get('nonce') || ''
    };

    const fieldIds = {
        client_id: 'clientId',
        redirect_uri: 'redirectUri',
        response_type: 'responseType',
        scope: 'scope',
        state: 'state',
        code_challenge: 'codeChallenge',
        code_challenge_method: 'codeChallengeMethod',
        nonce: 'nonce'
    };
    Object.entries(fieldIds).forEach(([name, id]) => {
        document.getElementById(id).value = values[name];
    });

    const clientName = params.get('client_name');
    if (clientName) document.getElementById('clientName').textContent = clientName;
    document.getElementById('pkceStatus').textContent = values.code_challenge
        ? 'PKCE secured (S256)'
        : 'PKCE is required';

    const permissionDefinitions = {
        openid: ['lock', 'Sign you in', 'Use your AuthSys identity to sign in to this application'],
        profile: ['person', 'View your profile', 'Access your name and profile information'],
        email: ['email', 'View your email address', 'Access your primary email address'],
        offline_access: ['schedule', 'Keep access when you are away', 'Allow the application to refresh access without asking you to sign in again']
    };

    const list = document.getElementById('permissionList');
    (values.scope || 'openid profile email').split(/\s+/).filter(Boolean).forEach((scope) => {
        const [icon, title, description] = permissionDefinitions[scope] ||
            ['verified_user', `Access ${scope}`, 'Access requested by this application'];
        const item = document.createElement('div');
        item.className = 'permission-item';

        const iconBox = document.createElement('div');
        iconBox.className = 'permission-icon';
        const iconNode = document.createElement('span');
        iconNode.className = 'material-symbols-outlined';
        iconNode.textContent = icon;
        iconBox.appendChild(iconNode);

        const text = document.createElement('div');
        text.className = 'permission-text';
        const titleNode = document.createElement('div');
        titleNode.className = 'permission-title';
        titleNode.textContent = title;
        const descriptionNode = document.createElement('div');
        descriptionNode.className = 'permission-description';
        descriptionNode.textContent = description;
        const metadataNode = document.createElement('span');
        metadataNode.className = 'permission-meta';
        metadataNode.textContent = scope === 'offline_access'
            ? 'Additional session access'
            : 'Identity information';
        text.append(titleNode, descriptionNode, metadataNode);
        item.append(iconBox, text);
        list.appendChild(item);
    });

    async function submitConsent(action) {
        const buttons = document.querySelectorAll('.consent-actions button');
        buttons.forEach(button => { button.disabled = true; });
        try {
            const csrfResponse = await fetch('/api/oauth/csrf', { credentials: 'same-origin' });
            const csrf = await csrfResponse.json();
            if (!csrfResponse.ok || !csrf.csrf_token) throw new Error('Authorization session expired');

            const response = await fetch('/api/oauth/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ ...values, action, csrf_token: csrf.csrf_token })
            });
            const result = await response.json();
            if (!response.ok || !result.redirect_url) {
                throw new Error(result.error_description || result.error || 'Authorization failed');
            }
            window.location.assign(result.redirect_url);
        } catch (error) {
            document.getElementById('consentError').textContent =
                error.message || 'Something went wrong. Please try again.';
            buttons.forEach(button => { button.disabled = false; });
        }
    }

    document.getElementById('btnAllow').addEventListener('click', () => submitConsent('allow'));
    document.getElementById('btnDeny').addEventListener('click', () => submitConsent('deny'));
}());
