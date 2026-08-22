/** @type {import('jest').Config} */
module.exports = {
    roots: ['<rootDir>/tests'],
    testMatch: ['**/?(*.)+(test).[jt]s'],
    testTimeout: 30000,
    testPathIgnorePatterns: [
        '/node_modules/',
        '/tests/unused/',
        '/tests/auth-full.test.js',
        '/tests/blue-team-defense.test.js',
        '/tests/module-load.test.js',
        '/tests/red-team-pentest.test.js',
        '/tests/security-hardening.test.js',
        '/tests/session-expiry.test.js',
    ],
    verbose: true,
};
