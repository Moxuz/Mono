#!/usr/bin/env node

// One-time maintenance command for an existing deployment. The application
// also runs this idempotently as part of its nightly production cleanup.
require('dotenv').config();

const mongoose = require('mongoose');
const SecurityAudit = require('../src/shared/models/SecurityAudit');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/authdb';

async function main() {
    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 5000,
        connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 5000
    });

    const scrubbed = await SecurityAudit.scrubLegacyIdentityFields();
    console.log(`Scrubbed ${scrubbed} legacy security-audit records.`);
}

main()
    .catch(error => {
        console.error('Audit PII scrub failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
