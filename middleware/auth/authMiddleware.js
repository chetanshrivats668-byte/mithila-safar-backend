import { verifyAccessToken } from '../../utils/jwt/jwtHelper.js';

/**
 * Standard user authentication middleware (Access Token verification)
 */
export function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Token format is invalid' });
    }

    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    res.status(401).json({
      success: false,
      message: isExpired ? 'Unauthorized: Your session has expired. Please log in again.' : 'Unauthorized: Invalid token format'
    });
  }
}

/**
 * Explicit check to block users operating in temporary offline fallback sessions
 */
export function blockTemporarySession(req, res, next) {
  if (req.user && req.user.temporarySession) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: This action is restricted in database offline mode. Please connect to a fully verified account.'
    });
  }
  next();
}

/**
 * Admin authorization middleware
 */
export function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Token format is invalid' });
    }

    const decoded = verifyAccessToken(token);
    if (!decoded || !decoded.admin) {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin privileges required' });
    }

    // Explicitly block temporary sessions from accessing admin functions
    if (decoded.temporarySession) {
      return res.status(403).json({ success: false, message: 'Forbidden: Temporary offline sessions cannot access admin functions.' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    res.status(401).json({
      success: false,
      message: isExpired ? 'Unauthorized: Your admin session has expired. Please log in again.' : 'Unauthorized: Invalid token'
    });
  }
}

/**
 * Collaborator/Vendor authorization middleware
 */
export function requireCollaborator(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Collaborator access required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Token format is invalid' });
    }

    const decoded = verifyAccessToken(token);
    if (!decoded || !decoded.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Forbidden: Collaborator privileges required' });
    }

    // Explicitly block temporary sessions from accessing collaborator dashboards
    if (decoded.temporarySession) {
      return res.status(403).json({ success: false, message: 'Forbidden: Temporary offline sessions cannot access partner dashboards.' });
    }

    req.collaborator = decoded;
    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    res.status(401).json({
      success: false,
      message: isExpired ? 'Unauthorized: Your partner session has expired. Please log in again.' : 'Unauthorized: Invalid token'
    });
  }
}

export function requireModuleAccess(...moduleNames) {
  return (req, res, next) => {
    if (!req.collaborator) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Collaborator access required' });
    }

    const rawCategories = req.collaborator.serviceCategories;
    const normalizedCategories = Array.isArray(rawCategories)
      ? rawCategories
      : rawCategories
        ? [rawCategories]
        : [];
    const normalizedRoleType = typeof req.collaborator.type === 'string' ? req.collaborator.type.toLowerCase() : '';
    const categories = normalizedCategories
      .map(category => typeof category === 'string' ? category.toLowerCase() : '')
      .filter(Boolean);

    if (normalizedRoleType && !categories.includes(normalizedRoleType)) {
      categories.push(normalizedRoleType);
    }

    const requestedModules = moduleNames
      .map(moduleName => typeof moduleName === 'string' ? moduleName.toLowerCase() : '')
      .filter(Boolean);

    const hasAccess = !requestedModules.length || requestedModules.some(moduleName => categories.includes(moduleName));

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: You do not have access to the ${moduleNames.join('/')} module`,
        collaboratorModules: categories
      });
    }

    req.collaborator.serviceCategories = categories;
    next();
  };
}
