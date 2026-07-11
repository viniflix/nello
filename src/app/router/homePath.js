export function getHomePath(user) {
  if (!user?.profile) return '/login';
  return user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
}
