/**
 * Password Strength Validator (SIMPLIFIED VERSION)
 *
 * Requirements:
 * - Minimum 8 characters (ONLY REQUIREMENT)
 *
 * Optional feedback (does not block):
 * - Uppercase letter
 * - Lowercase letter
 * - Number
 * - Special character
 */

const COMMON_PASSWORDS = require('./common-passwords');

/**
 * Validate password strength
 * @param {string} password - The password to validate
 * @returns {object} - { valid: boolean, errors: string[], score: number }
 */
function validatePassword(password) {
  const errors = [];
  let score = 0;

  // ตรวจสอบเพียงข้อเดียวที่บังคับ: ความยาวขั้นต่ำ 8 ตัวอักษร
  if (!password) {
    errors.push('Password is required');
    return {
      valid: false,
      errors,
      score: 0,
      strength: 'none'
    };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else {
    score += 1;
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least 1 number');
  }

  // นับ score สำหรับ UI feedback เท่านั้น ไม่บล็อกการสมัคร

  // Optional: Bonus points for UI (doesn't block registration)
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=$$$${};':"\\|,.<>\/?]/.test(password)) score += 1;

  // Optional: Warn about common passwords (but don't block)
  // if (COMMON_PASSWORDS && COMMON_PASSWORDS.has(password.toLowerCase())) {
  //   score = Math.max(0, score - 2); // Reduce score but don't block
  // }

  // Determine if password is valid
  const valid = errors.length === 0;

  return {
    valid,
    errors,
    score: Math.min(score, 10), // Cap at 10
    strength: getStrengthLabel(score)
  };
}

/**
 * Get strength label based on score
 */
function getStrengthLabel(score) {
  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  if (score <= 7) return 'strong';
  return 'very strong';
}

/**
 * Check for sequential characters (optional - for UI feedback only)
 */
function checkSequentialChars(password) {
  const lower = password.toLowerCase();
  const sequences = [
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm'
  ];

  for (const seq of sequences) {
    for (let i = 0; i <= seq.length - 3; i++) {
      const seq3 = seq.substring(i, i + 3);
      if (lower.includes(seq3)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Generate password strength indicator for frontend (optional UI feedback)
 */
function getPasswordStrengthInfo(password) {
  if (!password) {
    return {
      score: 0,
      strength: 'none',
      requirements: [
        { label: '8+ characters', met: false },
        { label: 'Uppercase letter', met: false },
        { label: 'Lowercase letter', met: false },
        { label: 'Number', met: false },
        { label: 'Special character', met: false }
      ]
    };
  }

  const requirements = [
    { label: '8+ characters', met: password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
    { label: 'Special character', met: /[!@#$%^&*()_+\-=$$$${};':"\\|,.<>\/?]/.test(password) }
  ];

  const metCount = requirements.filter(r => r.met).length;
  const score = metCount / requirements.length * 100;

  return {
    score,
    strength: getStrengthLabel(metCount),
    requirements
  };
}

module.exports = {
  validatePassword,
  getPasswordStrengthInfo,
  COMMON_PASSWORDS
};