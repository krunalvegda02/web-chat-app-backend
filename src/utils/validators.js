

// src/utils/validators.js
const isValidEmail = (email) => {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

const isValidPhone = (phone) => {
  if (!phone) return false;
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Allow formats: +1234567890, 1234567890, or any 10-15 digit number
  const phoneRegex = /^\+?\d{10,15}$/;
  return phoneRegex.test(cleaned);
}

const isValidPassword = (password) => {
  return password && password.length >= 6;
};

const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const validateEmail = (email) => {
  if (!email) throw new Error('Email is required');
  if (!isValidEmail(email)) throw new Error('Invalid email format');
  return true;
};

const validatePassword = (password) => {
  if (!password) throw new Error('Password is required');
  if (!isValidPassword(password)) throw new Error('Password must be at least 6 characters');
  return true;
};

const validatePhone = (phone) => {
  if (!phone) return true; // Phone is optional
  if (!isValidPhone(phone)) throw new Error('Invalid phone number format');
  return true;
};

export {
  isValidEmail,
  isValidPassword,
  isValidObjectId,
  validateEmail,
  validatePassword,
  validatePhone
};
