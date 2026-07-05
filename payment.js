/**
 * payments.js
 * Specialized module for validating payment formats, handling UPI addressing schemes, 
 * and processing client-side transaction parameter checks.
 */

/**
 * Validates whether a given string matches the standard UPI Virtual Payment Address (VPA) format.
 * @param {string} upiId - The UPI address to test (e.g. "player@upi")
 * @returns {boolean} True if the VPA matches standard structures, false otherwise.
 */
export function validateUPI(upiId) {
  if (!upiId) return false;
  // Standard VPA structure validation expression
  const upiRegex = /^[\w.-]+@[\w.-]+$/;
  return upiRegex.test(upiId.trim());
}

/**
 * Validates UTR (Unique Transaction Reference) values for typical Indian banking schemes.
 * UPI transactions typically generate a 12-digit numeric reference.
 * @param {string} utr - The transaction reference number to evaluate
 * @returns {boolean}
 */
export function validateUTR(utr) {
  if (!utr) return false;
  const cleanUTR = utr.trim();
  // Standard check for a 12-digit numeric UPI transaction reference string
  const utrRegex = /^\d{12}$/;
  return utrRegex.test(cleanUTR);
}

/**
 * Validates client-side parameters for deposit requests.
 * @param {number} amount - Targeted deposit amount
 * @param {string} utr - Unique Reference String
 * @returns {Object} Validation outcome mapping { valid: boolean, message: string }
 */
export function validateDepositParams(amount, utr) {
  const numericAmount = Number(amount);
  
  if (isNaN(numericAmount) || numericAmount < 10) {
    return {
      valid: false,
      message: "Deposit amount must be a number equal to or greater than ₹10."
    };
  }

  if (!utr || utr.trim().length < 6) {
    return {
      valid: false,
      message: "UTR/Reference ID must be provided and must contain a valid transaction signature."
    };
  }

  return { valid: true, message: "OK" };
}

/**
 * Validates client-side parameters for payout withdrawal requests.
 * @param {number} amount - Targeted withdrawal amount
 * @param {string} upiId - Customer payment address
 * @param {number} currentBalance - Active cached wallet balance of user
 * @returns {Object} Validation outcome mapping { valid: boolean, message: string }
 */
export function validateWithdrawalParams(amount, upiId, currentBalance) {
  const numericAmount = Number(amount);

  if (isNaN(numericAmount) || numericAmount < 50) {
    return {
      valid: false,
      message: "Withdrawal amount must be a number equal to or greater than ₹50."
    };
  }

  if (numericAmount > currentBalance) {
    return {
      valid: false,
      message: `Insufficient vault balance. Available balance: ₹${currentBalance.toFixed(2)}`
    };
  }

  if (!validateUPI(upiId)) {
    return {
      valid: false,
      message: "The provided payment address is invalid. Please double check your UPI VPA format."
    };
  }

  return { valid: true, message: "OK" };
}