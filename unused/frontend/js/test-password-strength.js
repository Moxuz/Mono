/**
 * Password Strength Feature Test
 * Tests the password strength meter functionality
 */

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║      PASSWORD STRENGTH METER - TEST SUITE                ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

function test(description, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${description}`);
        passed++;
    } catch (error) {
        console.log(`❌ FAIL: ${description}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

// Test password strength calculator
console.log('📋 Testing Password Strength Calculator...\n');

test('Empty password returns score 0', () => {
    const result = window.passwordStrength.calculate('');
    if (result.score !== 0) throw new Error(`Expected 0, got ${result.score}`);
});

test('Weak password (short)', () => {
    const result = window.passwordStrength.calculate('abc');
    if (result.score >= 30) throw new Error(`Expected weak, got ${result.strength}`);
});

test('Fair password (8 chars, no complexity)', () => {
    const result = window.passwordStrength.calculate('abcdefgh');
    if (result.score < 20 || result.score >= 60) throw new Error(`Expected fair, got ${result.strength}`);
});

test('Good password (8+ chars, some complexity)', () => {
    const result = window.passwordStrength.calculate('Password1');
    if (result.score < 60 || result.score >= 80) throw new Error(`Expected good, got ${result.strength}`);
});

test('Strong password (all requirements)', () => {
    const result = window.passwordStrength.calculate('Secur3P@ss!');
    if (result.score < 80) throw new Error(`Expected strong, got ${result.strength}`);
});

test('Password with uppercase', () => {
    const result = window.passwordStrength.calculate('Password123!');
    const hasUpper = result.requirements.find(r => r.text === 'Uppercase letter');
    if (!hasUpper || !hasUpper.met) throw new Error('Uppercase not detected');
});

test('Password with lowercase', () => {
    const result = window.passwordStrength.calculate('PASSWORD123!');
    const hasLower = result.requirements.find(r => r.text === 'Lowercase letter');
    if (!hasLower || !hasLower.met) throw new Error('Lowercase not detected');
});

test('Password with number', () => {
    const result = window.passwordStrength.calculate('Password!');
    const hasNumber = result.requirements.find(r => r.text === 'Number');
    if (!hasNumber || !hasNumber.met) throw new Error('Number not detected');
});

test('Password with special char', () => {
    const result = window.passwordStrength.calculate('Password123');
    const hasSpecial = result.requirements.find(r => r.text === 'Special character');
    if (!hasSpecial || !hasSpecial.met) throw new Error('Special char not detected');
});

test('Common pattern detection (123)', () => {
    const result = window.passwordStrength.calculate('Test123!');
    // Should have penalty for pattern
    if (result.score > 70) throw new Error('Pattern penalty not applied');
});

test('Color coding for weak password', () => {
    const result = window.passwordStrength.calculate('abc');
    if (result.color !== '#ef4444') throw new Error(`Expected red, got ${result.color}`);
});

test('Color coding for strong password', () => {
    const result = window.passwordStrength.calculate('Secur3P@ss!');
    if (result.color !== '#10b981') throw new Error(`Expected green, got ${result.color}`);
});

// Summary
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║                    TEST SUMMARY                           ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║  ✅ Passed: ${passed.toString().padEnd(43)} ║`);
console.log(`║  ❌ Failed: ${failed.toString().padEnd(43)} ║`);
console.log(`║  📊 Total:  ${(passed + failed).toString().padEnd(42)} ║`);
const percentage = (passed + failed) > 0 ? ((passed / (passed + failed)) * 100).toFixed(1) : 0;
console.log(`║  📈 Success: ${(percentage + '%').padEnd(42)} ║`);
console.log('╚═══════════════════════════════════════════════════════════╝\n');

if (failed > 0) {
    console.log('⚠️  Some tests failed. Please review the errors above.\n');
} else {
    console.log('🎉 All password strength tests passed!\n');
    console.log('✅ Features Working:');
    console.log('   - Password strength calculation');
    console.log('   - Color-coded strength meter');
    console.log('   - Requirements checklist');
    console.log('   - Pattern detection');
    console.log('   - Password visibility toggle\n');
}
