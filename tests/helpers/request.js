/**
 * Shared HTTP request helper for integration tests.
 * Uses Node's built-in http module — no extra dependencies.
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

/**
 * Make an HTTP request to the auth server.
 * @param {string} method  - HTTP method
 * @param {string} path    - e.g. '/api/auth/login'
 * @param {object} [body]  - JSON body (optional)
 * @param {string} [token] - Bearer token (optional)
 * @param {object} [extra] - Extra options: { headers, cookies }
 * @returns {Promise<{ status: number, data: any, headers: object }>}
 */
function makeRequest(method, path, body = null, token = null, extra = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;

        const bodyStr = body ? JSON.stringify(body) : null;

        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(extra.headers || {}),
        };
        if (bodyStr) {
            headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: method.toUpperCase(),
            headers,
        };

        const req = lib.request(options, (res) => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                let data;
                try { data = JSON.parse(raw); } catch { data = raw; }
                resolve({ status: res.statusCode, data, headers: res.headers });
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

/**
 * Convenience wrappers
 */
const get  = (path, token, extra) => makeRequest('GET',    path, null,  token, extra);
const post = (path, body, token, extra) => makeRequest('POST',   path, body,  token, extra);
const put  = (path, body, token, extra) => makeRequest('PUT',    path, body,  token, extra);
const del  = (path, body, token, extra) => makeRequest('DELETE', path, body,  token, extra);

module.exports = { makeRequest, get, post, put, del, BASE_URL };
