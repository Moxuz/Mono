/**
 * Secure Secret Generator
 * Generates cryptographically strong secrets for JWT, Session, etc.
 * Run: node scripts/generate-secrets.js
 */

const crypto = require('crypto');

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║         SECURE SECRET GENERATOR                          ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

/**
 * Generate cryptographically secure random string
 * @param {number} length - Length in bytes (32 bytes = 256 bits)
 * @returns {string} Hex string
 */
function generateSecret(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate JWT secret (minimum 256 bits / 32 bytes)
 * @returns {string}
 */
function generateJWTSecret() {
    // 64 bytes = 512 bits (very secure)
    return generateSecret(64);
}

/**
 * Generate session secret
 * @returns {string}
 */
function generateSessionSecret() {
    // 64 bytes = 512 bits
    return generateSecret(64);
}

/**
 * Generate encryption key
 * @returns {string}
 */
function generateEncryptionKey() {
    // 32 bytes = 256 bits (AES-256)
    return generateSecret(32);
}

/**
 * Check secret strength
 * @param {string} secret
 * @returns {Object} Strength analysis
 */
function checkSecretStrength(secret) {
    const length = secret.length;
    const hasUpper = /[A-Z]/.test(secret);
    const hasLower = /[a-z]/.test(secret);
    const hasNumber = /[0-9]/.test(secret);
    const hasSpecial = /[^A-Za-z0-9]/.test(secret);
    
    let score = 0;
    const issues = [];
    
    // Length checks
    if (length < 32) {
        score += 20;
        issues.push('❌ Too short (minimum 32 characters)');
    } else if (length < 64) {
        score += 40;
        issues.push('⚠️  Consider using 64+ characters');
    } else {
        score += 60;
    }
    
    // Character diversity
    if (hasUpper) score += 10;
    else issues.push('⚠️  No uppercase letters');
    
    if (hasLower) score += 10;
    else issues.push('⚠️  No lowercase letters');
    
    if (hasNumber) score += 10;
    else issues.push('⚠️  No numbers');
    
    if (hasSpecial) score += 10;
    else issues.push('⚠️  No special characters');
    
    // Hex string bonus (our generated secrets)
    if (/^[0-9a-f]+$/.test(secret)) {
        score += 20; // Hex is good for secrets
    }
    
    return {
        score,
        length,
        strength: score >= 80 ? '✅ Strong' : score >= 60 ? '⚠️  Moderate' : '❌ Weak',
        issues,
        recommendations: [
            'Use at least 64 characters (512 bits)',
            'Store in environment variables',
            'Never commit to version control',
            'Rotate secrets periodically',
            'Use different secrets for different purposes'
        ]
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE SECRETS
// ─────────────────────────────────────────────────────────────────────────────

console.log('🔐 Generating Secure Secrets...\n');

const jwtSecret = generateJWTSecret();
const sessionSecret = generateSessionSecret();
const encryptionKey = generateEncryptionKey();

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║              GENERATED SECRETS                            ║');
console.log('╠═══════════════════════════════════════════════════════════╣');

console.log('\n🔑 JWT_SECRET (512 bits / 64 bytes):');
console.log(`   ${jwtSecret}`);
console.log(`   Length: ${jwtSecret.length} characters`);

console.log('\n🔑 SESSION_SECRET (512 bits / 64 bytes):');
console.log(`   ${sessionSecret}`);
console.log(`   Length: ${sessionSecret.length} characters`);

console.log('\n🔑 ENCRYPTION_KEY (256 bits / 32 bytes):');
console.log(`   ${encryptionKey}`);
console.log(`   Length: ${encryptionKey.length} characters`);

// ─────────────────────────────────────────────────────────────────────────────
// STRENGTH CHECK
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
console.log('║              STRENGTH ANALYSIS                              ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('📊 JWT_SECRET Analysis:');
const jwtStrength = checkSecretStrength(jwtSecret);
console.log(`   Strength: ${jwtStrength.strength}`);
console.log(`   Score: ${jwtStrength.score}/100`);
console.log(`   Length: ${jwtStrength.length} chars`);
if (jwtStrength.issues.length > 0) {
    console.log('   Issues:');
    jwtStrength.issues.forEach(issue => console.log(`      ${issue}`));
}

console.log('\n📊 SESSION_SECRET Analysis:');
const sessionStrength = checkSecretStrength(sessionSecret);
console.log(`   Strength: ${sessionStrength.strength}`);
console.log(`   Score: ${sessionStrength.score}/100`);
console.log(`   Length: ${sessionStrength.length} chars`);

console.log('\n📊 ENCRYPTION_KEY Analysis:');
const encryptionStrength = checkSecretStrength(encryptionKey);
console.log(`   Strength: ${encryptionStrength.strength}`);
console.log(`   Score: ${encryptionStrength.score}/100`);
console.log(`   Length: ${encryptionStrength.length} chars`);

// ─────────────────────────────────────────────────────────────────────────────
// ENV FILE CONTENT
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
console.log('║              .env FILE CONTENT                              ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log('║  Copy this to your .env file:                             ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('┌─────────────────────────────────────────────────────────┐');
console.log('│ # .env                                                  │');
console.log('│ # ⚠️  NEVER commit this file to git!                    │');
console.log('│                                                         │');
console.log(`│ NODE_ENV=development                                    │`);
console.log(`│ PORT=5000                                               │`);
console.log(`│ BASE_URL=http://localhost:5000                          │`);
console.log(`│ AUTH_SERVER_URL=http://localhost:5000                   │`);
console.log('│                                                         │');
console.log('│ # Database                                              │');
console.log(`│ MONGODB_URI=mongodb://localhost:27017/authdb            │`);
console.log('│                                                         │');
console.log('│ # JWT Configuration                                     │');
console.log(`│ JWT_SECRET=${jwtSecret}`);
console.log(`│ JWT_EXPIRE=1h                                           │`);
console.log('│                                                         │');
console.log('│ # Session Configuration                                 │');
console.log(`│ SESSION_SECRET=${sessionSecret}`);
console.log('│                                                         │');
console.log('│ # Encryption (for 2FA secrets)                          │');
console.log(`│ ENCRYPTION_KEY=${encryptionKey}`);
console.log('│                                                         │');
console.log('│ # Redis Configuration                                   │');
console.log('│ REDIS_HOST=localhost                                    │');
console.log('│ REDIS_PORT=6379                                         │');
console.log('│ REDIS_PASSWORD=                                         │');
console.log('│                                                         │');
console.log('│ # Rate Limiting                                         │');
console.log('│ RATE_LIMIT_WHITELIST=127.0.0.1                          │');
console.log('│                                                         │');
console.log('│ # Email Configuration (Update with your SMTP)           │');
console.log('│ EMAIL_HOST=smtp.mailtrap.io                             │');
console.log('│ EMAIL_PORT=587                                          │');
console.log('│ EMAIL_USER=your_email_user                              │');
console.log('│ EMAIL_PASSWORD=your_email_password                      │');
console.log('│                                                         │');
console.log('│ # Google OAuth (Update with your credentials)           │');
console.log('│ GOOGLE_CLIENT_ID=your_google_client_id                  │');
console.log('│ GOOGLE_CLIENT_SECRET=your_google_client_secret          │');
console.log('│ GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback');
console.log('│                                                         │');
console.log('│ # CORS Configuration                                    │');
console.log('│ CORS_ORIGIN=http://localhost:3000,http://localhost:4000 │');
console.log('└─────────────────────────────────────────────────────────┘');

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
console.log('║           SECURITY RECOMMENDATIONS                        ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('✅ DO:');
console.log('   • Store secrets in environment variables');
console.log('   • Use different secrets for each environment');
console.log('   • Rotate secrets every 90 days');
console.log('   • Use at least 256 bits (32 bytes) for all secrets');
console.log('   • Keep secrets in secure vault (AWS Secrets Manager, etc.)');
console.log('   • Add .env to .gitignore');
console.log('');
console.log('❌ DON\'T:');
console.log('   • Never commit .env to version control');
console.log('   • Never share secrets via email/chat');
console.log('   • Never use default/weak secrets in production');
console.log('   • Never reuse secrets across projects');
console.log('   • Never log secrets to console/files');

// ─────────────────────────────────────────────────────────────────────────────
// SAVE TO FILE
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const envContent = `# Environment
NODE_ENV=development

# Server
PORT=5000
BASE_URL=http://localhost:5000
AUTH_SERVER_URL=http://localhost:5000

# Database
MONGODB_URI=mongodb://localhost:27017/authdb

# JWT Configuration
JWT_SECRET=${jwtSecret}
JWT_EXPIRE=1h

# Session Configuration
SESSION_SECRET=${sessionSecret}

# Encryption (for 2FA secrets)
ENCRYPTION_KEY=${encryptionKey}

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Rate Limiting
RATE_LIMIT_WHITELIST=127.0.0.1

# Email Configuration
EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=587
EMAIL_USER=your_email_user
EMAIL_PASSWORD=your_email_password

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:4000

# Logging
LOG_LEVEL=info

# Kafka (Optional)
USE_KAFKA_LOGGING=false
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=auth-app
`;

const envPath = path.join(__dirname, '..', '.env.generated');
fs.writeFileSync(envPath, envContent);

console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
console.log('║              FILE SAVED                                     ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║  📁 Saved to: .env.generated                              ║`);
console.log('║                                                           ║');
console.log('║  Next steps:                                              ║');
console.log('║  1. Review the secrets above                              ║');
console.log('║  2. Copy to .env file (or rename .env.generated)          ║');
console.log('║  3. Restart your server: npm start                        ║');
console.log('║  4. Test: curl http://localhost:5000/health               ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('🎉 Secrets generated successfully!\n');
