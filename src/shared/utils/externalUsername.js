'use strict';

function normalizeExternalUsername(value, fallback = 'user') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '');
    return (normalized || fallback).slice(0, 64);
}

async function uniqueExternalUsername(User, candidate, fallback = 'user') {
    const base = normalizeExternalUsername(candidate, fallback);
    let username = base;
    let suffix = 2;
    while (await User.exists({ username })) {
        const suffixText = `_${suffix++}`;
        username = `${base.slice(0, 64 - suffixText.length)}${suffixText}`;
    }
    return username;
}

module.exports = {
    normalizeExternalUsername,
    uniqueExternalUsername
};
