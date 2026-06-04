export function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  // Preserve arrays as arrays (previous implementation converted arrays to plain objects)
  if (Array.isArray(obj)) {
    return obj.map(v => sanitizeInput(v));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = value.trim().replace(/[<>]/g, '');
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function validateCollaboratorRegistration(data) {
  const errors = [];
  if (!data.name || data.name.trim().length < 2) errors.push('Full name is required (min 2 characters)');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Valid email is required');
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone.replace(/\D/g, '').slice(-10))) errors.push('Valid 10-digit Indian mobile is required');
  if (!data.password || data.password.length < 6) errors.push('Password must be at least 6 characters');
  if (!data.businessName || data.businessName.trim().length < 2) errors.push('Business name is required');
  if (!data.businessType) errors.push('Business type is required');
  if (!data.serviceCategories || !Array.isArray(data.serviceCategories) || data.serviceCategories.length === 0) errors.push('At least one service category is required');
  if (!data.city) errors.push('City is required');
  if (!data.upiId || !data.upiId.includes('@')) errors.push('Valid UPI ID is required');
  return errors;
}

export function validateBusCreation(data) {
  const errors = [];
  if (!data.busName || data.busName.trim().length < 2) errors.push('Bus name is required');
  if (!data.busType) errors.push('Bus type is required');
  if (!data.numberPlate) errors.push('Number plate is required');
  if (!data.totalSeats || data.totalSeats < 1 || data.totalSeats > 80) errors.push('Valid seat count (1-80) is required');
  if (!data.routeCities || !Array.isArray(data.routeCities) || data.routeCities.length < 2) errors.push('At least 2 route cities are required');
  if (!data.pricePerKm || data.pricePerKm < 1) errors.push('Valid price per km is required');
  return errors;
}

export function validateSeatUpdate(data) {
  const validStatuses = ['available', 'booked', 'reserved', 'blocked', 'maintenance'];
  if (!data.seatId) return ['Seat ID is required'];
  if (!data.status || !validStatuses.includes(data.status)) return ['Invalid status. Must be one of: ' + validStatuses.join(', ')];
  return [];
}

export function validateUserRegistration(data) {
  const errors = [];
  if (!data.name || data.name.trim().length < 2) errors.push('Full name is required (min 2 characters)');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.push('Valid email is required');
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone.replace(/\D/g, '').slice(-10))) errors.push('Valid 10-digit Indian mobile number is required');
  if (!data.password || data.password.length < 6) errors.push('Password must be at least 6 characters');
  return errors;
}

export function validateUserLogin(data) {
  const errors = [];
  const username = (data.email || '').trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
  const cleanPhone = username.replace(/\D/g, '').slice(-10);
  const isPhone = /^[6-9]\d{9}$/.test(cleanPhone);

  if (!username) {
    errors.push('Email or Phone Number is required');
  } else if (!isEmail && !isPhone) {
    errors.push('Valid email or 10-digit mobile number is required');
  }

  if (!data.password || data.password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  return errors;
}

