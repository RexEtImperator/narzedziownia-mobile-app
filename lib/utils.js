/**
 * Funkcje pomocnicze dla aplikacji mobilnej
 */

// Import zgodny ze źródłem webowym (stałe i sprawdzanie uprawnień)
import { PERMISSIONS, ROLES, hasPermission as hasPermissionLocal } from './constants';

/**
 * Sprawdza czy użytkownik ma rolę administratora
 * Preferencyjnie używa hasPermission z constants, z fallbackiem na starą logikę
 * 
 * @param {Object} user - Obiekt użytkownika (me z API)
 * @returns {boolean} - true jeśli użytkownik jest adminem
 */
export const isAdmin = (user) => {
  try {
    // Lokalna implementacja oparta o lib/constants
    // Jeśli w przyszłości pojawi się PERMISSIONS.ADMIN, to hasPermissionLocal zadziała bez zmian
    const role = user?.role || user?.user?.role || (Array.isArray(user?.roles) ? user.roles[0] : null);
    if (!role) return false;
    const r = String(role).toLowerCase();
    return r === ROLES.ADMIN || r === 'administrator' || r.includes('admin');
  } catch (_) {
    if (!user) {
      return false;
    }
    const role = user?.role || user?.user?.role || (Array.isArray(user?.roles) ? user.roles[0] : null);
    if (!role) {
      return false;
    }
    const normalizedRole = String(role).toLowerCase();

    return normalizedRole === ROLES.ADMIN || 
           normalizedRole === 'administrator' || 
           normalizedRole.includes('admin');
  }
};

/**
 * Sprawdza czy użytkownik ma określoną rolę
 * 
 * @param {Object} user - Obiekt użytkownika
 * @param {string} targetRole - Docelowa rola do sprawdzenia
 * @returns {boolean}
 */
export const hasRole = (user, targetRole) => {
  if (!user || !targetRole) {
    return false;
  }
  const role = user?.role || user?.user?.role || (Array.isArray(user?.roles) ? user.roles[0] : null);
  if (!role) {
    return false;
  }
  return String(role).toLowerCase() === String(targetRole).toLowerCase();
};

/**
 * Pobiera znormalizowaną rolę użytkownika
 * 
 * @param {Object} user - Obiekt użytkownika
 * @returns {string|null} - Znormalizowana rola lub null
 */
export const getUserRole = (user) => {
  if (!user) {
    return null;
  }
  const role = user?.role || user?.user?.role || (Array.isArray(user?.roles) ? user.roles[0] : null);
  if (!role) {
    return null;
  }
  return String(role).toLowerCase();
};

/**
 * Sprawdza czy użytkownik posiada podane uprawnienie (zgodnie z webowym constants)
 *
 * @param {Object} user
 * @param {string} permission
 * @returns {boolean}
 */
export const hasPermission = (user, permission) => {
  try {
    return hasPermissionLocal(user, permission);
  } catch (_) {
    // Fallback: tylko ADMIN rozpoznawany z roli
    const role = getUserRole(user);
    if (!role) return false;
    if (String(permission).toLowerCase() === 'admin') {
      return role === ROLES.ADMIN || role === 'administrator';
    }
    return false;
  }
};