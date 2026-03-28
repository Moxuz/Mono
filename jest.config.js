/** @type {import('jest').Config} */
module.exports = {
    testTimeout: 30000,
    testPathIgnorePatterns: [
        '/node_modules/',
        '/tests/unused/',
    ],
    verbose: true,
};
