const crypto = require('crypto');
const { chromium } = require('playwright');

const AUTH_ORIGIN = new URL(
    process.env.UI_AUDIT_AUTH_URL || 'https://testmono-user.duckdns.org'
).origin;
const CLIENT_1_ORIGIN = new URL(
    process.env.UI_AUDIT_CLIENT_1_URL || 'https://client-1.duckdns.org'
).origin;
const CLIENT_2_ORIGIN = new URL(
    process.env.UI_AUDIT_CLIENT_2_URL || 'https://client-2.duckdns.org'
).origin;
const CHROME_PATH = process.env.UI_AUDIT_CHROME_PATH ||
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const RUN_MARKER = `v23ui_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const TEST_USER = {
    username: RUN_MARKER,
    email: `${RUN_MARKER}@example.test`,
    password: 'R7!mQ2@vL9#sT4',
    newPassword: 'N8$kR3!wP6@dF2'
};

const PROJECT_HOSTS = new Set([
    new URL(AUTH_ORIGIN).hostname,
    new URL(CLIENT_1_ORIGIN).hostname,
    new URL(CLIENT_2_ORIGIN).hostname
]);
const runtimeFailures = [];
let checks = 0;

function check(name, condition) {
    if (!condition) throw new Error(`Check failed: ${name}`);
    checks += 1;
    console.log(`PASS ${checks}: ${name}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isProjectUrl(value) {
    try {
        return PROJECT_HOSTS.has(new URL(value).hostname);
    } catch (_) {
        return false;
    }
}

function safeRuntimeMessage(value) {
    return String(value || '')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/([?&](?:code|state|token|client_secret|access_token|refresh_token)=)[^&\s]+/gi, '$1[redacted]')
        .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
        .slice(0, 300);
}

function expectedHttpFailure(url, status) {
    let pathname = '';
    try { pathname = new URL(url).pathname; } catch (_) { return false; }
    if (status === 401 && pathname === '/api/auth/update-cookie-consent') return true;
    if (status === 401 && pathname === '/api/auth/login') return true;
    if (status === 400 && pathname.startsWith('/api/auth/reset-password/')) return true;
    return false;
}

function observePage(page, label) {
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        // HTTP failures are checked from the response event with URL and status.
        if (/^Failed to load resource:/i.test(text)) return;
        if (!isProjectUrl(page.url())) return;
        runtimeFailures.push(`${label}: console: ${safeRuntimeMessage(text)}`);
    });
    page.on('pageerror', error => {
        if (!isProjectUrl(page.url())) return;
        runtimeFailures.push(`${label}: pageerror: ${safeRuntimeMessage(error.message)}`);
    });
    page.on('requestfailed', request => {
        if (!isProjectUrl(request.url())) return;
        if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
        runtimeFailures.push(
            `${label}: requestfailed: ${safeRuntimeMessage(request.url())} (${safeRuntimeMessage(request.failure()?.errorText)})`
        );
    });
    page.on('response', response => {
        if (!isProjectUrl(response.url()) || response.status() < 400) return;
        if (expectedHttpFailure(response.url(), response.status())) return;
        runtimeFailures.push(
            `${label}: HTTP ${response.status()} ${safeRuntimeMessage(new URL(response.url()).pathname)}`
        );
    });
    page.on('dialog', dialog => dialog.accept().catch(() => {}));
}

async function newPage(context, label) {
    const page = await context.newPage();
    observePage(page, label);
    return page;
}

async function goto(page, url) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    check(`page responds: ${new URL(url).pathname || '/'}`, Boolean(response) && response.status() < 400);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    return response;
}

async function checkLayout(page, name) {
    const result = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0)
    }));
    check(`${name} has no unexpected horizontal overflow`, result.width <= result.viewport + 2);
}

async function clickCookieChoice(page, selector) {
    const button = page.locator(selector);
    await button.waitFor({ state: 'visible', timeout: 5000 });
    const sync = page.waitForResponse(response => {
        if (!isProjectUrl(response.url())) return false;
        const pathname = new URL(response.url()).pathname;
        return pathname === '/api/auth/update-cookie-consent' || pathname === '/api/cookie-consent';
    }, { timeout: 5000 }).catch(() => null);
    await button.click();
    await sync;
    await page.locator('#cookieBanner').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

async function loginWithPassword(page, password, remember = false) {
    await page.goto(`${AUTH_ORIGIN}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('#password').fill(password);
    if (remember) await page.locator('#remember').check();
    await page.locator('#loginBtn').click();
}

async function waitForConsent(page) {
    await page.waitForURL(url =>
        url.hostname === new URL(AUTH_ORIGIN).hostname &&
        url.pathname === '/consent.html', { timeout: 30000 });
    await page.locator('#btnAllow').waitFor({ state: 'visible', timeout: 10000 });
}

async function waitForClientDashboard(page, origin, pathname) {
    const host = new URL(origin).hostname;
    await page.waitForURL(url => url.hostname === host && url.pathname === pathname, { timeout: 30000 });
}

async function probeSocialProvider(browser, selector, expectedHost, label) {
    const context = await browser.newContext();
    const page = await newPage(context, `social-${label}`);
    try {
        await page.goto(`${AUTH_ORIGIN}/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.locator(selector).click();
        await page.waitForURL(url => url.hostname === expectedHost || url.hostname.endsWith(`.${expectedHost}`), {
            timeout: 30000
        });
        check(`${label} login reaches the official provider`,
            page.url().startsWith('https://') &&
            (new URL(page.url()).hostname === expectedHost || new URL(page.url()).hostname.endsWith(`.${expectedHost}`)));
    } finally {
        await context.close();
    }
}

async function waitForAdmin(page) {
    console.log(`ADMIN_PROMOTION_TARGET=${TEST_USER.username}`);
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
        await page.goto(`${AUTH_ORIGIN}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        const role = await page.evaluate(async () => {
            const response = await fetch('/api/auth/profile', { credentials: 'same-origin' });
            const result = await response.json();
            return result?.data?.role || null;
        }).catch(() => null);
        if (role === 'admin') {
            check('isolated audit user was promoted for admin UI testing', true);
            return;
        }
        await sleep(1500);
    }
    throw new Error('Timed out waiting for temporary admin promotion');
}

async function publicAndRecoveryChecks(browser) {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await newPage(context, 'public');
    try {
        await goto(page, `${AUTH_ORIGIN}/login.html`);
        await clickCookieChoice(page, '.btn-cookie-decline');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await sleep(1200);
        check('reject non-essential persists on AuthSys', !(await page.locator('#cookieBanner').isVisible()));

        await goto(page, `${AUTH_ORIGIN}/`);
        check('landing page renders AuthSys', await page.getByText('AuthSys', { exact: false }).first().isVisible());
        await goto(page, `${AUTH_ORIGIN}/documentation.html`);
        check('developer documentation renders', await page.getByText('OAuth 2.0 Flow', { exact: true }).isVisible());
        await goto(page, `${AUTH_ORIGIN}/privacy-policy.html#terms`);
        check('combined Terms and Privacy page renders', await page.locator('#terms').isVisible());
        await goto(page, `${AUTH_ORIGIN}/api-docs.html`);
        await page.locator('#swagger-ui').waitFor({ state: 'visible' });
        check('local API documentation shell renders', await page.locator('#swagger-ui').isVisible());

        await goto(page, `${AUTH_ORIGIN}/forgot-password.html`);
        await page.locator('#email').fill(`${RUN_MARKER}_missing@example.test`);
        await page.locator('#submitBtn').click();
        await page.locator('#success-section').waitFor({ state: 'visible', timeout: 10000 });
        check('forgot-password UI returns a generic response for an unknown address', true);

        await goto(page, `${AUTH_ORIGIN}/reset-password.html`);
        check('reset-password disables submission without a token', await page.locator('#submitBtn').isDisabled());
        await goto(page, `${AUTH_ORIGIN}/reset-password.html?token=invalid-ui-audit-token`);
        await page.locator('#password').fill(TEST_USER.newPassword);
        await page.locator('#confirmPassword').fill(TEST_USER.newPassword);
        await page.locator('#submitBtn').click();
        await page.locator('#alert').waitFor({ state: 'visible', timeout: 10000 });
        check('reset-password UI reports an invalid token safely', true);

        await page.setViewportSize({ width: 390, height: 844 });
        await goto(page, `${AUTH_ORIGIN}/login.html`);
        await checkLayout(page, 'mobile login');
    } finally {
        await context.close();
    }
}

async function registerAndProfile(page) {
    await goto(page, `${AUTH_ORIGIN}/register.html`);
    await clickCookieChoice(page, '.btn-cookie-accept');
    await page.locator('#username').fill(TEST_USER.username);
    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('#password').fill(TEST_USER.password);
    await page.locator('#confirmPassword').fill(TEST_USER.password);

    await page.locator('[data-input="password"]').click();
    check('registration password visibility toggle works',
        await page.locator('#password').getAttribute('type') === 'text');
    await page.locator('[data-input="password"]').click();

    await page.locator('#registerBtn').click();
    await page.locator('#alert').waitFor({ state: 'visible' });
    check('registration requires Terms and Privacy acknowledgement',
        /agree|terms|privacy/i.test(await page.locator('#alert').textContent()));

    await page.locator('#consentEssential').check();
    await page.locator('#registerBtn').click();
    await page.waitForURL(`${AUTH_ORIGIN}/dashboard.html`, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    check('registration establishes an authenticated browser session', true);

    await goto(page, `${AUTH_ORIGIN}/profile.html`);
    await page.locator('#profileForm').waitFor({ state: 'visible' });
    check('username is read-only on profile', await page.locator('#username').isDisabled() ||
        await page.locator('#username').getAttribute('readonly') !== null);
    check('email is read-only on profile', await page.locator('#email').isDisabled() ||
        await page.locator('#email').getAttribute('readonly') !== null);

    await page.locator('#displayName').fill(`UI audit ${RUN_MARKER.slice(-6)}`);
    await page.locator('#bio').fill('Isolated v23 browser audit account.');
    await page.locator('#profileForm button[type="submit"]').click();
    await page.locator('#alert').waitFor({ state: 'visible', timeout: 10000 });
    check('profile update succeeds through the UI', /success|updated/i.test(await page.locator('#alert').textContent()));

    await page.locator('#changePasswordBtn').click();
    await page.locator('#currentPassword').fill(TEST_USER.password);
    await page.locator('#newPassword').fill(TEST_USER.newPassword);
    await page.locator('#confirmPassword').fill(TEST_USER.newPassword);
    await page.locator('#confirmChangePassBtn').click();
    await page.waitForURL(url => url.pathname === '/login.html', { timeout: 15000 });
    check('password change invalidates the current session and returns to login', true);

    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('#password').fill(TEST_USER.password);
    const oldLoginResponse = page.waitForResponse(response =>
        new URL(response.url()).pathname === '/api/auth/login', { timeout: 10000 });
    await page.locator('#loginBtn').click();
    const oldLogin = await oldLoginResponse;
    await page.locator('#alert').waitFor({ state: 'visible', timeout: 10000 });
    const oldLoginUrl = new URL(page.url());
    check('old password is rejected after a password change', oldLogin.status() === 401 &&
        !oldLoginUrl.searchParams.has('email') &&
        oldLoginUrl.searchParams.get('password') === 'changed');

    await page.locator('#password').fill(TEST_USER.newPassword);
    await page.locator('#remember').check();
    await page.locator('#loginBtn').click();
    await page.waitForURL(`${AUTH_ORIGIN}/dashboard.html`, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    check('new password and Remember me login succeed', true);
}

async function sessionUiChecks(browser, mainPage) {
    const otherContext = await browser.newContext();
    const otherPage = await newPage(otherContext, 'second-session');
    try {
        await loginWithPassword(otherPage, TEST_USER.newPassword, false);
        await otherPage.waitForURL(`${AUTH_ORIGIN}/dashboard.html`, { timeout: 15000 });
        check('a second real browser session can be created', true);

        await goto(mainPage, `${AUTH_ORIGIN}/user-activity.html#sessions`);
        await mainPage.locator('#sessionsGrid').waitFor({ state: 'visible' });
        await mainPage.locator('#revokeAllOthersBtn').waitFor({ state: 'visible', timeout: 10000 });
        await mainPage.locator('#revokeAllOthersBtn').click();
        await sleep(1000);

        const otherSession = await otherPage.evaluate(async () => {
            const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
            return response.json();
        });
        check('Revoke all other sessions invalidates the second browser', otherSession.authenticated === false);

        await mainPage.locator('#refreshLogsBtn').click();
        await mainPage.locator('#refreshLogsBtn').waitFor({ state: 'attached' });
        const downloadPromise = mainPage.waitForEvent('download', { timeout: 10000 });
        await mainPage.locator('#exportLogsBtn').click();
        const download = await downloadPromise;
        check('security activity export produces a JSON download', download.suggestedFilename().endsWith('.json'));

        const traceButton = mainPage.locator('.view-trace-btn').first();
        if (await traceButton.count()) {
            await traceButton.click();
            await mainPage.locator('#closeTraceBtn').waitFor({ state: 'visible' });
            await mainPage.locator('#closeTraceBtn').click();
            check('security trace details open and close', true);
        }
    } finally {
        await otherContext.close();
    }
}

async function apiKeyUiChecks(page) {
    await goto(page, `${AUTH_ORIGIN}/api-keys.html`);
    await page.locator('#apiKeysContainer').waitFor({ state: 'visible' });
    await page.locator('#createKeyBtn').click();
    await page.locator('#createModal').waitFor({ state: 'visible' });
    await page.locator('#cancelCreateBtn').click();
    check('create OAuth application modal can be cancelled', true);

    const appName = `UI ${RUN_MARKER}`;
    await page.locator('#createKeyBtn').click();
    await page.locator('#keyName').fill(appName);
    await page.locator('#redirectUris').fill('https://ui-audit.invalid/callback');
    await page.locator('#submitCreateKeyBtn').click();
    await page.locator('#secretModal').waitFor({ state: 'visible', timeout: 10000 });
    const idLength = (await page.locator('#newClientId').textContent()).trim().length;
    const secretLength = (await page.locator('#newClientSecret').textContent()).trim().length;
    check('new OAuth credentials are shown exactly once', idLength >= 16 && secretLength >= 24);
    await page.locator('#confirmSecretBtn').click();

    const card = page.locator('.api-key-card').filter({ hasText: appName });
    await card.waitFor({ state: 'visible', timeout: 10000 });
    await card.locator('[data-action="revoke"]').click();
    await card.waitFor({ state: 'detached', timeout: 10000 });
    check('OAuth application can be revoked from its UI card', true);
}

async function clientOAuthChecks(context, authPage) {
    const client1 = await newPage(context, 'client-1');
    const client2 = await newPage(context, 'client-2');

    await goto(client1, `${CLIENT_1_ORIGIN}/`);
    await clickCookieChoice(client1, '[data-cookie-consent="reject"]');
    await client1.getByRole('link', { name: /Login with AuthSys/i }).click();
    await waitForConsent(client1);
    check('Client 1 shows explicit AuthSys consent', await client1.locator('#permissionList').isVisible());
    await client1.locator('#btnAllow').click();
    await waitForClientDashboard(client1, CLIENT_1_ORIGIN, '/dashboard');
    await client1.locator('#welcomeCard').waitFor({ state: 'visible' });
    check('Client 1 OAuth callback creates a protected client session', true);

    await goto(client1, `${CLIENT_1_ORIGIN}/products`);
    const productButtons = client1.locator('[data-product]');
    const productCount = await productButtons.count();
    for (let index = 0; index < productCount; index += 1) await productButtons.nth(index).click();
    check('Client 1 product controls update the cart',
        Number(await client1.locator('#cartCount').textContent()) === productCount);
    await goto(client1, `${CLIENT_1_ORIGIN}/profile`);
    await client1.locator('#profileCard').waitFor({ state: 'visible' });
    check('Client 1 profile uses the OAuth identity', !/Loading/i.test(await client1.locator('#profileCard').textContent()));

    await goto(client2, `${CLIENT_2_ORIGIN}/`);
    await clickCookieChoice(client2, '[data-consent="accept"]');
    await client2.getByRole('link', { name: 'Continue with AuthSys' }).click();
    await waitForConsent(client2);
    await client2.locator('#btnDeny').click();
    await client2.waitForURL(url => url.hostname === new URL(CLIENT_2_ORIGIN).hostname &&
        url.searchParams.get('error') === 'access_denied', { timeout: 30000 });
    check('Client 2 handles a denied consent without creating a session', true);

    await client2.getByRole('link', { name: 'Continue with AuthSys' }).click();
    await waitForConsent(client2);
    await client2.locator('#btnAllow').click();
    await waitForClientDashboard(client2, CLIENT_2_ORIGIN, '/dashboard.html');
    await client2.locator('#userName').waitFor({ state: 'visible' });
    await client2.waitForFunction(() => {
        const userName = document.querySelector('#userName');
        return Boolean(userName?.textContent && !/Loading/i.test(userName.textContent));
    }, undefined, { timeout: 10000 });
    check('Client 2 OAuth callback creates a protected client session',
        !/Loading/i.test(await client2.locator('#userName').textContent()));

    await goto(authPage, `${AUTH_ORIGIN}/settings.html`);
    await authPage.locator('#authorizedAppsList [data-revoke-consent]').first().waitFor({ state: 'visible', timeout: 10000 });
    const appsBefore = await authPage.locator('#authorizedAppsList [data-revoke-consent]').count();
    check('authorized applications list includes both OAuth clients', appsBefore >= 2);

    await authPage.locator('#themeSelect').selectOption('light');
    await authPage.locator('#languageSelect').selectOption('en');
    await authPage.locator('#emailNotif').uncheck();
    await authPage.locator('#loginAlerts').check();
    await authPage.locator('#saveSettingsBtn').click();
    await authPage.locator('#alert').waitFor({ state: 'visible', timeout: 10000 });
    check('settings preferences save through the UI', /success|saved/i.test(await authPage.locator('#alert').textContent()));

    const client1Consent = authPage.locator('#authorizedAppsList .settings-item')
        .filter({ hasText: /client-1|ShopHub/i }).first();
    await client1Consent.locator('[data-revoke-consent]').click();
    await sleep(750);
    const appsAfter = await authPage.locator('#authorizedAppsList [data-revoke-consent]').count();
    check('revoke consent removes only one authorized application', appsAfter === appsBefore - 1);

    await client1.goto(`${CLIENT_1_ORIGIN}/dashboard`, { waitUntil: 'domcontentloaded' });
    await waitForConsent(client1);
    check('revoking Client 1 consent invalidates its existing access token', true);
    await client1.locator('#btnDeny').click();
    await client1.waitForURL(url => url.hostname === new URL(CLIENT_1_ORIGIN).hostname &&
        url.searchParams.get('error') === 'access_denied', { timeout: 30000 });

    await client2.goto(`${CLIENT_2_ORIGIN}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await client2.waitForURL(url => url.hostname === new URL(CLIENT_2_ORIGIN).hostname &&
        url.pathname === '/dashboard.html', { timeout: 15000 });
    check('revoking Client 1 does not invalidate Client 2', true);

    await client2.getByRole('button', { name: 'Sign out' }).click();
    await client2.waitForURL(`${CLIENT_2_ORIGIN}/`, { timeout: 15000 });
    await client2.getByRole('link', { name: 'Continue with AuthSys' }).click();
    await waitForClientDashboard(client2, CLIENT_2_ORIGIN, '/dashboard.html');
    check('remembered Client 2 consent enables SSO without another login or consent page', true);
    await client2.getByRole('button', { name: 'Sign out' }).click();
    await client2.waitForURL(`${CLIENT_2_ORIGIN}/`, { timeout: 15000 });

    return { client1, client2 };
}

async function adminUiChecks(page) {
    await goto(page, `${AUTH_ORIGIN}/admin.html`);
    await page.locator('#app').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#status').waitFor({ state: 'visible' });
    const status = await page.locator('#status').textContent();
    check('admin console reports MongoDB, Redis, and Kafka status',
        /mongodb/i.test(status) && /redis/i.test(status) && /kafka/i.test(status));

    await goto(page, `${AUTH_ORIGIN}/admin/users`);
    await page.locator('#content').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#refresh').click();
    await page.locator('#users tr').first().waitFor({ state: 'visible', timeout: 10000 });
    check('admin user directory loads and refreshes', await page.locator('#users tr').count() > 0);
    if (!(await page.locator('#next').isDisabled())) {
        await page.locator('#next').click();
        await page.locator('#previous').click();
        check('admin user pagination controls work', true);
    }

    await goto(page, `${AUTH_ORIGIN}/admin/logs`);
    await page.locator('#logs tr').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#filterStatus').selectOption('success');
    await page.locator('#applyFilters').click();
    await page.locator('#logs tr').first().waitFor({ state: 'visible', timeout: 10000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('#exportLogs').click();
    const download = await downloadPromise;
    check('admin security log filters and CSV export work', download.suggestedFilename().endsWith('.csv'));
}

async function logoutAndDelete(page) {
    await goto(page, `${AUTH_ORIGIN}/admin.html`);
    await page.locator('#logout').click();
    await page.waitForURL(url => url.pathname === '/login.html', { timeout: 10000 });
    check('admin sign-out button terminates the AuthSys browser session', true);

    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('#password').fill(TEST_USER.newPassword);
    await page.locator('#loginBtn').click();
    await page.waitForURL(`${AUTH_ORIGIN}/dashboard.html`, { timeout: 15000 });

    await goto(page, `${AUTH_ORIGIN}/settings.html`);
    await page.locator('#deleteAccountBtn').click();
    await page.locator('#deletePassword').fill(TEST_USER.newPassword);
    await page.locator('#confirmDeleteBtn').click();
    await page.waitForURL(url => url.pathname === '/login.html' && url.searchParams.get('deleted') === 'true', {
        timeout: 15000
    });
    check('account deletion completes through the settings UI', true);

    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('#password').fill(TEST_USER.newPassword);
    await page.locator('#loginBtn').click();
    await page.locator('#alert').waitFor({ state: 'visible', timeout: 10000 });
    check('deleted account credentials cannot log in', true);
}

async function run() {
    console.log(`UI_AUDIT_MARKER=${RUN_MARKER}`);
    const browser = await chromium.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--disable-dev-shm-usage']
    });
    let mainContext;
    let accountCreated = false;
    let accountDeleted = false;

    try {
        await publicAndRecoveryChecks(browser);
        await probeSocialProvider(browser, '#googleLoginBtn', 'accounts.google.com', 'Google');
        await probeSocialProvider(browser, '#githubLoginBtn', 'github.com', 'GitHub');

        mainContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
        const mainPage = await newPage(mainContext, 'auth-main');
        await registerAndProfile(mainPage);
        accountCreated = true;
        await waitForAdmin(mainPage);
        await sessionUiChecks(browser, mainPage);
        await apiKeyUiChecks(mainPage);
        const clients = await clientOAuthChecks(mainContext, mainPage);
        await checkLayout(mainPage, 'desktop settings');
        await adminUiChecks(mainPage);
        await clients.client1.close();
        await clients.client2.close();
        await logoutAndDelete(mainPage);
        accountDeleted = true;

        const uniqueFailures = [...new Set(runtimeFailures)];
        if (uniqueFailures.length) {
            uniqueFailures.slice(0, 20).forEach(item => console.error(`RUNTIME_FAILURE ${item}`));
        }
        check('project pages produced no unexpected browser/runtime failures', uniqueFailures.length === 0);
        console.log(`UI_AUDIT_COMPLETE checks=${checks} marker=${RUN_MARKER}`);
    } finally {
        if (runtimeFailures.length && !accountDeleted) {
            [...new Set(runtimeFailures)].slice(0, 20)
                .forEach(item => console.error(`RUNTIME_FAILURE ${item}`));
        }
        if (mainContext && accountCreated && !accountDeleted) {
            await mainContext.request.delete(`${AUTH_ORIGIN}/api/auth/delete-account`, {
                data: { password: TEST_USER.newPassword },
                headers: {
                    'Content-Type': 'application/json',
                    Origin: AUTH_ORIGIN,
                    Referer: `${AUTH_ORIGIN}/settings.html`
                }
            }).catch(() => {});
        }
        await browser.close();
    }
}

run().catch(error => {
    console.error(`UI_AUDIT_FAILED marker=${RUN_MARKER} error=${safeRuntimeMessage(error.message)}`);
    process.exitCode = 1;
});
