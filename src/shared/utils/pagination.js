'use strict';

const MAX_PAGE_NUMBER = 1000;

function parsePagination(page, limit, defaultLimit = 20, maxLimit = 100, maxPage = MAX_PAGE_NUMBER) {
    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    return {
        page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, maxPage) : 1,
        limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, maxLimit) : Math.min(defaultLimit, maxLimit)
    };
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startOfUtcDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function endOfUtcDayExclusive(value) {
    const date = startOfUtcDay(value);
    if (!date) return null;
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
}

module.exports = { parsePagination, escapeRegExp, startOfUtcDay, endOfUtcDayExclusive, MAX_PAGE_NUMBER };
