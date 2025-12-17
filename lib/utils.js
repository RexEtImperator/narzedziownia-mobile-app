import { hasPermission as hasPermissionLocal } from './constants';

/**
 * Sprawdza czy użytkownik ma rolę administratora
 * Preferencyjnie używa hasPermission z constants, z fallbackiem na starą logikę
 * 
 * @param {Object} user - Obiekt użytkownika (me z API)
 * @returns {boolean} - true jeśli użytkownik jest adminem
 */
// Pomocnicza funkcja wyciągająca rolę użytkownika z różnych kształtów obiektu
const resolveRole = (user) => {
  try {
    if (!user) return null;
    const fromVal = (val) => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) return fromVal(val[0]);
      if (typeof val === 'object') {
        const candidates = [val.role, val.name, val.slug, val.key, val.code, val.type, val.title];
        for (const c of candidates) { if (typeof c === 'string' && c) return c; }
      }
      return null;
    };
    const direct = (
      fromVal(user.role) ||
      fromVal(user?.user?.role) ||
      fromVal(user?.data?.user?.role) ||
      fromVal(user?.data?.role) ||
      fromVal(user?.payload?.user?.role) ||
      fromVal(user?.payload?.role) ||
      fromVal(user?.account?.role) ||
      fromVal(user?.profile?.role) ||
      fromVal(user?.currentUser?.role)
    );
    if (direct) return direct;
    const arr = (
      (Array.isArray(user.roles) ? fromVal(user.roles[0]) : null) ||
      (Array.isArray(user?.user?.roles) ? fromVal(user?.user?.roles[0]) : null) ||
      (Array.isArray(user?.data?.user?.roles) ? fromVal(user?.data?.user?.roles[0]) : null)
    );
    return arr;
  } catch { return null; }
};

export const isAdmin = (user) => {
  const roleRaw = resolveRole(user);
  if (!roleRaw) return false;
  const r = String(roleRaw).toLowerCase();
  return r === 'admin' || r === 'administrator';
};

export const hasRole = (user, targetRole) => {
  if (!user || !targetRole) return false;
  const roleRaw = resolveRole(user);
  if (!roleRaw) return false;
  return String(roleRaw).toLowerCase() === String(targetRole).toLowerCase();
};

export const getUserRole = (user) => {
  const roleRaw = resolveRole(user);
  return roleRaw ? String(roleRaw).toLowerCase() : null;
};

export const hasPermission = (user, permission) => {
  return hasPermissionLocal(user, permission);
};

export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleString('pl-PL', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString('pl-PL');
};
