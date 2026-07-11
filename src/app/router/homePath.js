export function getHomePath(user) {
  if (!user?.profile) return '/login';
  return user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
}

export function hasRequiredUserType(profile, userType, allowAnyUserType = false) {
  return allowAnyUserType || !userType || profile?.user_type === userType;
}

export function resolveAuthenticatedPath(user, requestedPath) {
  if (!user?.profile) return null;

  const homePath = getHomePath(user);
  if (!requestedPath) return homePath;

  if (requestedPath.startsWith('/admin')) {
    return user.profile.is_admin === true ? requestedPath : homePath;
  }

  const portalPrefix = user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
  return requestedPath.startsWith(portalPrefix) ? requestedPath : homePath;
}
