/**
 * Role-Based Access Control Middleware
 * Roles: 'admin', 'purchasing', 'warehouse', 'production', 'sales', 'qc'
 * Admin always has access to all routes.
 */
export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
    }

    const { role } = req.user;

    // Admin has superuser privileges across all modules
    if (role === 'admin') {
      return next();
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Forbidden: Access requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: '${role}'.`
      });
    }

    next();
  };
}
