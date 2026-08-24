const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const config = require('../src/shared/config/config');
const User = require('../src/shared/models/User');
const Session = require('../src/shared/models/Session');
const TokenBlacklist = require('../src/shared/models/TokenBlacklist');
const Client = require('../src/shared/models/Client');
const securityAuditService = require('../src/shared/services/securityAudit.service');
const authService = require('../src/modules/auth/services/auth.service');
const oauthService = require('../src/modules/oauth/services/oauth.service');
const authController = require('../src/modules/auth/controllers/auth.controller');
const { redactText } = require('../src/shared/utils/auditIdentity');
const { rejectCrossOriginBrowserRequest } = require('../src/shared/middleware/csrf');

const userId = '507f1f77bcf86cd799439011';
const fakeUser = {
    _id: userId,
    id: userId,
    email: 'audit@example.test',
    username: 'audit_user',
    role: 'user',
    isActive: true
};

function thenableQuery(value) {
    const promise = Promise.resolve(value);
    return {
        select: jest.fn(() => promise),
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise)
    };
}

function mockResponse() {
    const res = {};
    res.set = jest.fn(() => res);
    res.status = jest.fn(() => res);
    res.clearCookie = jest.fn(() => res);
    res.json = jest.fn(payload => payload);
    return res;
}

afterEach(() => {
    jest.restoreAllMocks();
});

describe('v23 session and token regressions', () => {
    test('OAuth access tokens are unique even when issued in the same second', () => {
        const first = oauthService.generateAccessToken(fakeUser, 'client-1', 'openid', 'grant-1');
        const second = oauthService.generateAccessToken(fakeUser, 'client-1', 'openid', 'grant-1');
        const firstClaims = jwt.decode(first);
        const secondClaims = jwt.decode(second);

        expect(first).not.toBe(second);
        expect(firstClaims.jti).toMatch(/^[a-f0-9]{32}$/);
        expect(secondClaims.jti).toMatch(/^[a-f0-9]{32}$/);
        expect(firstClaims.jti).not.toBe(secondClaims.jti);
    });

    test('pre-auth browser mutations reject an explicit cross-site origin', () => {
        const req = {
            protocol: 'https',
            get: jest.fn(name => ({
                host: 'auth.example.test',
                origin: 'https://evil.example.test',
                referer: undefined
            })[name])
        };
        const res = mockResponse();
        const next = jest.fn();
        rejectCrossOriginBrowserRequest(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('consumeToken allows one use and treats a unique collision as replay', async () => {
        const token = jwt.sign(
            { sub: userId, type: 'refresh_token' },
            config.JWT_SECRET,
            { expiresIn: '1h' }
        );

        jest.spyOn(TokenBlacklist, 'create').mockResolvedValueOnce({});
        await expect(TokenBlacklist.consumeToken(token, userId, 'client-1')).resolves.toBe(true);

        TokenBlacklist.create.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
        await expect(TokenBlacklist.consumeToken(token, userId, 'client-1')).resolves.toBe(false);
    });

    test('validateToken accepts only a live user with a matching active session', async () => {
        const token = authService.createToken(fakeUser);
        jest.spyOn(TokenBlacklist, 'isBlacklisted').mockResolvedValue(false);
        jest.spyOn(User, 'findById').mockReturnValue(thenableQuery({ _id: userId, isActive: true }));
        jest.spyOn(Session, 'findOne').mockResolvedValue({ isExpired: () => false });

        const result = await authService.validateToken(token);
        expect(result.valid).toBe(true);
        expect(Session.findOne).toHaveBeenCalledWith(expect.objectContaining({
            userId,
            accessTokenHash: Session.hashToken(token),
            isActive: true
        }));
    });

    test('validateToken rejects a blacklisted token before session lookup', async () => {
        const token = authService.createToken(fakeUser);
        jest.spyOn(TokenBlacklist, 'isBlacklisted').mockResolvedValue(true);
        const sessionLookup = jest.spyOn(Session, 'findOne');

        await expect(authService.validateToken(token)).resolves.toMatchObject({
            valid: false,
            error: 'Token has been revoked'
        });
        expect(sessionLookup).not.toHaveBeenCalled();
    });

    test('first-party refresh atomically replaces the matching session hash', async () => {
        const refreshToken = authService.generateRefreshToken(fakeUser);
        jest.spyOn(TokenBlacklist, 'isBlacklisted').mockResolvedValue(false);
        jest.spyOn(TokenBlacklist, 'revokeToken').mockResolvedValue({});
        jest.spyOn(User, 'findById').mockReturnValue(thenableQuery(fakeUser));
        jest.spyOn(Session, 'findOneAndUpdate').mockResolvedValue({ _id: 'session-1' });
        jest.spyOn(securityAuditService, 'logSecurityEvent').mockResolvedValue({});

        const result = await authService.refreshToken(refreshToken, null, { ipAddress: '127.0.0.1' });
        expect(result.token).toBeTruthy();
        expect(result.refreshToken).toBeTruthy();
        expect(Session.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                refreshTokenHash: Session.hashRefreshToken(refreshToken),
                userId,
                isActive: true
            }),
            expect.any(Object),
            { new: true }
        );
    });

    test('first-party refresh issues nothing when the session hash lost the race', async () => {
        const refreshToken = authService.generateRefreshToken(fakeUser);
        jest.spyOn(TokenBlacklist, 'isBlacklisted').mockResolvedValue(false);
        jest.spyOn(TokenBlacklist, 'revokeToken').mockResolvedValue({});
        const directUserLookup = thenableQuery(fakeUser);
        directUserLookup.select = jest.fn(() => Promise.resolve(null));
        jest.spyOn(User, 'findById').mockReturnValue(directUserLookup);
        jest.spyOn(Session, 'findOneAndUpdate').mockResolvedValue(null);
        jest.spyOn(securityAuditService, 'logSecurityEvent').mockResolvedValue({});
        jest.spyOn(authService, 'blacklistAllUserTokens').mockResolvedValue({ success: true, count: 0 });

        await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Session has expired or been revoked');
        expect(authService.blacklistAllUserTokens).toHaveBeenCalledWith(userId, 'security_breach');
    });

    test('OAuth refresh uses atomic token consumption', async () => {
        const refreshToken = oauthService.generateRefreshToken(
            fakeUser,
            'client-1',
            'openid profile email offline_access',
            'grant-1'
        );
        jest.spyOn(User, 'findById').mockResolvedValue(fakeUser);
        jest.spyOn(oauthService, 'isGrantActive').mockResolvedValue(true);
        jest.spyOn(TokenBlacklist, 'consumeToken').mockResolvedValueOnce(true);

        const result = await oauthService.refreshAccessToken(refreshToken);
        expect(result.access_token).toBeTruthy();
        expect(result.refresh_token).toBeTruthy();
        expect(TokenBlacklist.consumeToken).toHaveBeenCalledTimes(1);
    });

    test('OAuth refresh rejects replay when atomic consumption loses', async () => {
        const refreshToken = oauthService.generateRefreshToken(
            fakeUser,
            'client-1',
            'openid profile email offline_access',
            'grant-1'
        );
        jest.spyOn(User, 'findById').mockResolvedValue(fakeUser);
        jest.spyOn(oauthService, 'isGrantActive').mockResolvedValue(true);
        jest.spyOn(TokenBlacklist, 'consumeToken').mockResolvedValue(false);

        await expect(oauthService.refreshAccessToken(refreshToken)).rejects.toThrow('Token has been revoked');
    });

    test('web session status fails closed for a revoked or missing session', async () => {
        jest.spyOn(User, 'findById').mockResolvedValue(fakeUser);
        jest.spyOn(Session, 'findOne').mockResolvedValue(null);
        const req = {
            session: {
                user: { id: userId, sessionId: '507f1f77bcf86cd799439012' },
                destroy: jest.fn(callback => callback())
            },
            logout: jest.fn(callback => callback())
        };
        const res = mockResponse();

        await authController.getWebSession(req, res);
        expect(res.json).toHaveBeenCalledWith({ authenticated: false, user: null });
        expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
    });

    test('wrong password does not reveal that an account is inactive', async () => {
        const inactiveUser = {
            ...fakeUser,
            password: await bcrypt.hash('CorrectPass99!', 10),
            isActive: false,
            isLocked: () => false
        };
        jest.spyOn(User, 'findOne').mockReturnValue({
            select: jest.fn().mockResolvedValue(inactiveUser)
        });
        jest.spyOn(securityAuditService, 'logLoginFailed').mockResolvedValue({});

        await expect(authService.login({
            email: inactiveUser.email,
            password: 'WrongPass99!',
            req: {}
        })).rejects.toThrow('Invalid credentials');
    });

    test('sensitive text redaction covers bearer tokens, OAuth query values and Mongo credentials', () => {
        const redacted = redactText(
            'Bearer abc.def.ghi https://x.test/cb?code=secret&state=opaque mongodb://admin:pass@db:27017/auth'
        );
        expect(redacted).not.toContain('abc.def.ghi');
        expect(redacted).not.toContain('code=secret');
        expect(redacted).not.toContain('state=opaque');
        expect(redacted).not.toContain('admin:pass');
    });

    test('OAuth revocation verifies token signatures and client binding before blacklisting', async () => {
        const token = oauthService.generateAccessToken(
            fakeUser,
            'client-1',
            'openid profile email',
            'grant-1'
        );
        const claims = oauthService.verifyRevocableToken(token, 'client-1');
        expect(claims.sub).toBe(userId);
        expect(() => oauthService.verifyRevocableToken(token, 'client-2')).toThrow('Invalid OAuth token');
        expect(() => oauthService.verifyRevocableToken(token + 'tampered', 'client-1')).toThrow();

        jest.spyOn(TokenBlacklist, 'revokeToken').mockResolvedValue({});
        await expect(oauthService.revokeToken(
            token,
            userId,
            'user_logout',
            'client-1'
        )).resolves.toMatchObject({ message: 'Token revoked successfully' });
    });
});

describe('v23 source-level security invariants', () => {
    test('OAuth application controls bind before initial API waits', () => {
        const source = fs.readFileSync('public/js/api-keys.js', 'utf8');
        const listenerStart = source.indexOf("document.addEventListener('DOMContentLoaded'");
        const bindControls = source.indexOf('setupEventListeners();', listenerStart);
        const firstAwait = source.indexOf('await loadBrowserUser();', listenerStart);

        expect(listenerStart).toBeGreaterThanOrEqual(0);
        expect(bindControls).toBeGreaterThan(listenerStart);
        expect(bindControls).toBeLessThan(firstAwait);
    });

    test('login and registration forms bind early and use POST fallbacks', () => {
        for (const file of ['public/js/login.js', 'public/js/register.js']) {
            const source = fs.readFileSync(file, 'utf8');
            const listenerStart = source.indexOf("document.addEventListener('DOMContentLoaded'");
            const firstAwait = source.indexOf('await', listenerStart);
            const bind = source.indexOf("addEventListener('submit'", listenerStart);
            expect(listenerStart).toBeGreaterThanOrEqual(0);
            expect(bind).toBeGreaterThan(listenerStart);
            expect(bind).toBeLessThan(firstAwait);
        }
        expect(fs.readFileSync('public/login.html', 'utf8')).toContain('method="post" action="/api/auth/login"');
        expect(fs.readFileSync('public/register.html', 'utf8')).toContain('method="post" action="/api/auth/register"');
    });

    test('AuthSys parses HttpOnly re-auth cookies and sanitizes error URLs', () => {
        const source = fs.readFileSync('src/app.js', 'utf8');
        expect(source).toContain('app.use(cookieParser())');
        expect(source).toContain('url:     sanitizedRequestUrl(req)');
        expect(source).toContain('Math.max(1000, midnight.getTime() - now.getTime())');
        expect(source).not.toContain("'unsafe-eval'");
        expect(source).toContain('scriptSrc:   ["\'self\'"]');
        expect(source).not.toContain('":referrer"');
    });

    test('both relying parties bind UserInfo subject to the verified ID token', () => {
        for (const file of ['cLient-app-1/server.js', 'client-2/server.js']) {
            const source = fs.readFileSync(file, 'utf8');
            expect(source).toContain('userInfo subject'.replace('userInfo', 'UserInfo'));
            expect(source).toContain('timeout: 5000');
            expect(source).toContain('requireSameOrigin');
            expect(source).toContain('/api/oauth/introspect');
            expect(source).toContain('hasActiveClientGrant');
            expect(source).not.toContain('req.session.idToken');
            expect(source).toContain("connect-src 'self';");
            expect(source).not.toContain("connect-src 'self' https: http:");
            expect(source).toContain("status: ready ? 'ok' : 'degraded'");
        }
        const client1 = fs.readFileSync('cLient-app-1/server.js', 'utf8');
        expect(client1).not.toContain("app.post('/api/refresh'");
        expect(client1).not.toContain("app.get('/social-callback'");
    });

    test('legacy analytics and host-metric routes are not mounted', () => {
        const routes = fs.readFileSync('src/modules/dashboard/routes/dashboard.routes.js', 'utf8');
        const monitoring = fs.readFileSync('src/modules/dashboard/routes/monitoring.routes.js', 'utf8');
        expect(routes).not.toContain("router.use('/analytics'");
        expect(routes).not.toContain("router.use('/user'");
        expect(monitoring).not.toContain("'/realtime'");
        expect(monitoring).not.toContain("'/metrics'");
    });

    test('removed monitoring modules and nonstandard OAuth session_token stay absent', () => {
        [
            'src/shared/utils/websocket.js',
            'src/modules/dashboard/services/realtimeMetrics.service.js',
            'src/modules/dashboard/routes/analytics.routes.js',
            'src/modules/dashboard/routes/redis.health.js'
        ].forEach(file => expect(fs.existsSync(file)).toBe(false));
        expect(fs.readFileSync('src/modules/oauth/controllers/oauth.controller.js', 'utf8'))
            .not.toContain('session_token');
        expect(fs.readFileSync('src/modules/oauth/services/oauth.service.js', 'utf8'))
            .not.toContain('sessionToken');
    });

    test('all shipped HTML contains no inline scripts or inline event handlers', () => {
        for (const directory of ['public', 'cLient-app-1/public', 'client-2/public']) {
            const htmlFiles = fs.readdirSync(directory).filter(name => name.endsWith('.html'));
            for (const file of htmlFiles) {
                const source = fs.readFileSync(`${directory}/${file}`, 'utf8');
                expect(source).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
                expect(source).not.toMatch(/\son(?:click|change|submit|load|error)\s*=/i);
            }
        }
    });

    test('mock clients use an isolated Redis session store without AuthSys database credentials', () => {
        for (const directory of ['cLient-app-1', 'client-2']) {
            const packageJson = JSON.parse(fs.readFileSync(`${directory}/package.json`, 'utf8'));
            const server = fs.readFileSync(`${directory}/server.js`, 'utf8');
            expect(packageJson.dependencies['connect-mongo']).toBeUndefined();
            expect(packageJson.dependencies['connect-redis']).toBeTruthy();
            expect(packageJson.dependencies.redis).toBeTruthy();
            expect(server).toContain("require('connect-redis')");
            expect(server).not.toContain('connect-mongo');
            expect(server).not.toContain('MONGODB_URI');
        }

        const clientCompose = fs.readFileSync('docker-compose.client.yml', 'utf8');
        expect(clientCompose).toContain('client-session-redis:');
        expect(clientCompose).toContain('CLIENT_REDIS_PASSWORD');
        expect(clientCompose).not.toContain('MONGO_ROOT_');
        expect(clientCompose).not.toContain('MONGODB_URI');
        expect(clientCompose).not.toContain('auth-network');

        const rootCompose = fs.readFileSync('docker-compose.yml', 'utf8');
        expect(rootCompose).toMatch(/x-app-base:[\s\S]*?networks:\s*\n\s*- auth-network\s*\n\s*- client-network/);
        expect(rootCompose).toMatch(/nginx:[\s\S]*?networks:\s*\n\s*- client-network/);
    });

    test('roles and declared dependencies match the simplified runtime', () => {
        const roleValues = User.schema.path('role').enumValues;
        expect(roleValues).toEqual(['user', 'admin']);
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        expect(packageJson.dependencies.redis).toBeTruthy();
        expect(packageJson.dependencies.axios).toBeUndefined();
        expect(packageJson.dependencies['connect-mongo']).toBeUndefined();
        expect(packageJson.dependencies.ws).toBeUndefined();
        expect(packageJson.dependencies['swagger-ui-express']).toBeUndefined();
        expect(packageJson.dependencies['swagger-ui-dist']).toBeTruthy();
        const limiter = require('../src/shared/middleware/rateLimiter');
        expect(limiter.TIER_LIMITS).toBeUndefined();
        expect(limiter.dynamicTierLimiter).toBeUndefined();
    });

    test('private pages are server-guarded and demo UIs do not claim fake metrics', () => {
        const appSource = fs.readFileSync('src/app.js', 'utf8');
        for (const page of ['dashboard.html', 'profile.html', 'settings.html', 'api-keys.html', 'user-activity.html', 'consent.html']) {
            expect(appSource).toContain(page);
        }
        expect(appSource).toContain("app.get('/' + page, authenticate");

        const appUi = fs.readFileSync('public/js/api-keys.js', 'utf8');
        const client2Dashboard = fs.readFileSync('client-2/public/dashboard.html', 'utf8');
        expect(appUi).not.toContain('1000/hr');
        expect(appUi).not.toContain('requests24h');
        expect(client2Dashboard).not.toContain('99.9%');
    });

    test('settings toggles keep a real clickable input surface', () => {
        const style = fs.readFileSync('public/css/style.css', 'utf8');
        const toggleInput = style.slice(style.lastIndexOf('.settings-toggle input {'));
        expect(toggleInput).toContain('position: absolute;');
        expect(toggleInput).toContain('width: 100%;');
        expect(toggleInput).toContain('height: 100%;');
        expect(style).toContain('pointer-events: none;');
    });

    test('browser security events are not persisted or printed to the console', () => {
        const dashboard = fs.readFileSync('public/js/dashboard.js', 'utf8');
        const activity = fs.readFileSync('public/js/user-activity.js', 'utf8');
        expect(dashboard).not.toContain("localStorage.setItem('recentEvents'");
        expect(dashboard).not.toContain("localStorage.getItem('recentEvents'");
        expect(dashboard).not.toContain("console.log('✅ Login activity data:'");
        expect(dashboard).toContain("window.addEventListener('pagehide'");
        expect(dashboard).toContain('dashboardRequestControllers.forEach(controller => controller.abort())');
        expect(dashboard).toContain('createDashboardRequestController');
        expect(dashboard).toContain('signal: requestController.signal');
        expect(dashboard).toContain('isDashboardRequestCancelled(error, requestController)');
        expect(activity).not.toContain("console.log('✅ Audit logs data:'");
        expect(activity).not.toContain("console.log('📋 Trace Data:'");
    });

    test('failed-login counters use an atomic database increment', () => {
        const source = fs.readFileSync('src/shared/models/User.js', 'utf8');
        expect(source).toContain('$inc: { failedLoginAttempts: 1 }');
        expect(source).not.toContain('this.failedLoginAttempts += 1');
    });

    test('query parsing is scalar and admin session output excludes token hashes', () => {
        const appSource = fs.readFileSync('src/app.js', 'utf8');
        const logController = fs.readFileSync('src/modules/dashboard/controllers/log.controller.js', 'utf8');
        expect(appSource).toContain("app.set('query parser', 'simple')");
        expect(logController).toContain(".select('-accessTokenHash -refreshTokenHash -refreshTokenFamily')");
    });

    test('security-log APIs and CSV exports remain pseudonymous', () => {
        const logController = fs.readFileSync('src/modules/dashboard/controllers/log.controller.js', 'utf8');
        const auditModel = fs.readFileSync('src/shared/models/SecurityAudit.js', 'utf8');
        const adminUi = fs.readFileSync('public/js/admin-logs.js', 'utf8');
        expect(logController).not.toContain("select('username email')");
        expect(logController).not.toContain("select('email')");
        expect(logController).not.toContain("'Email', 'IP Address'");
        expect(auditModel).not.toContain("populate('userId', 'email username')");
        expect(adminUi).not.toContain('log.userInfo');
        expect(adminUi).toContain('log.emailHash');
    });

    test('Compose services cap Docker json-file log growth', () => {
        for (const file of [
            'docker-compose.yml',
            'docker-compose.client.yml',
            'docker-compose.kafka.yml',
            'deploy/local-fallback/docker-compose.local.yml'
        ]) {
            const source = fs.readFileSync(file, 'utf8');
            expect(source).toContain('driver: json-file');
            expect(source).toContain('max-size: "10m"');
            expect(source).toContain('max-file: "3"');
        }
    });

    test('HTTPS proxy rejects unknown TLS names and public links are not placeholders', () => {
        const nginx = fs.readFileSync('deploy/https/nginx.conf.template', 'utf8');
        expect(nginx).toContain('listen 443 ssl default_server;');
        expect(nginx).toContain('ssl_reject_handshake on;');

        for (const directory of ['public', 'cLient-app-1/public', 'client-2/public']) {
            const htmlFiles = fs.readdirSync(directory).filter(name => name.endsWith('.html'));
            for (const file of htmlFiles) {
                const source = fs.readFileSync(`${directory}/${file}`, 'utf8');
                expect(source).not.toMatch(/href=["']#["']/i);
            }
        }
    });

    test('Docker images use maintained Node 24 and copy only runtime files', () => {
        const authDockerfile = fs.readFileSync('Dockerfile', 'utf8');
        const clientDockerfile = fs.readFileSync('Dockerfile.client', 'utf8');
        expect(authDockerfile).toContain('FROM node:24-alpine');
        expect(clientDockerfile).toContain('FROM node:24-alpine');
        expect(authDockerfile).toContain('--disable-warning=TimeoutNegativeWarning');
        expect(authDockerfile).not.toContain('COPY . .');
        expect(clientDockerfile).not.toContain('COPY . .');
        expect(clientDockerfile).toContain("'/api/health'");

        for (const file of ['.dockerignore', 'cLient-app-1/.dockerignore', 'client-2/.dockerignore']) {
            const source = fs.readFileSync(file, 'utf8');
            expect(source).toContain('.env');
            expect(source).toContain('node_modules');
        }
        expect(fs.readFileSync('.dockerignore', 'utf8')).toContain('.codex-remote-attachments');
    });

    test('HTTPS overlays do not overwrite the upstream nginx image tag', () => {
        for (const relativePath of [
            'deploy/https/docker-compose.https.yml',
            'deploy/vps/docker-compose.vps.yml'
        ]) {
            const compose = fs.readFileSync(relativePath, 'utf8');
            expect(compose).toContain('image: testmono-auth-nginx:latest');
        }

        const vpsCompose = fs.readFileSync('deploy/vps/docker-compose.vps.yml', 'utf8');
        expect(vpsCompose.match(/external: true/g)).toHaveLength(2);
        expect(vpsCompose).toContain('name: ${AUTH_NETWORK_NAME:-auth-network}');
        expect(vpsCompose).toContain('name: ${CLIENT_NETWORK_NAME:-client-network}');

        const proxyDockerfile = fs.readFileSync('deploy/https/Dockerfile', 'utf8');
        const proxyEntrypoint = fs.readFileSync('deploy/https/entrypoint.sh', 'utf8');
        const proxyTemplate = fs.readFileSync('deploy/https/nginx.conf.template', 'utf8');
        expect(proxyDockerfile).toContain('CMD ["nginx", "-g", "daemon off;"]');
        expect(proxyEntrypoint).toContain('exec "$@"');
        expect(proxyTemplate.match(/proxy_hide_header Permissions-Policy;/g)).toHaveLength(3);
        expect(proxyTemplate.match(/proxy_hide_header Strict-Transport-Security;/g)).toHaveLength(3);
    });

    test('relying parties require subject and issued-at claims and validate state before OAuth errors', () => {
        for (const file of ['cLient-app-1/server.js', 'client-2/server.js']) {
            const source = fs.readFileSync(file, 'utf8');
            expect(source).toContain("typeof claims.sub !== 'string'");
            expect(source).toContain("typeof claims.iat !== 'number'");
            expect(source.indexOf('invalid_state')).toBeLessThan(source.indexOf('if (error) return res.redirect'));
        }
    });

    test('client 2 sends only registered OAuth authorization parameters', () => {
        const source = fs.readFileSync('client-2/server.js', 'utf8');
        const authorizeBlock = source.slice(
            source.indexOf('authorizeUrl.search = new URLSearchParams({'),
            source.indexOf('res.redirect(authorizeUrl.toString())')
        );
        expect(authorizeBlock).toContain('client_id: config.clientId');
        expect(authorizeBlock).toContain('redirect_uri: config.redirectUri');
        expect(authorizeBlock).toContain("response_type: 'code'");
        expect(authorizeBlock).toContain("code_challenge_method: 'S256'");
        expect(authorizeBlock).not.toContain('client_name');
    });

    test('OAuth client records reject empty grant and response capability arrays', () => {
        const client = new Client({
            client_id: 'audit-client',
            client_secret: 'audit-secret',
            client_name: 'Audit Client',
            redirect_uris: ['https://audit.example.test/callback'],
            contact_email: 'audit@example.test',
            owner: userId,
            grant_types: [],
            response_types: []
        });
        const validation = client.validateSync();
        expect(validation?.errors?.grant_types).toBeDefined();
        expect(validation?.errors?.response_types).toBeDefined();
    });

    test('OpenAPI document reflects v23 and standard OAuth grants', () => {
        const openapi = JSON.parse(fs.readFileSync('swagger.json', 'utf8'));
        expect(openapi.openapi).toBe('3.0.3');
        expect(openapi.info.version).toBe('23.0.0');
        expect(openapi.components.schemas.OAuthTokenRequest.properties.session_token).toBeUndefined();
    });
});
