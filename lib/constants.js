// Stałe uprawnień używane w aplikacji
export const PERMISSIONS = {
  // Zarządzanie użytkownikami
  MANAGE_USERS: 'manage_users',
  VIEW_USERS: 'view_users',
  CREATE_USERS: 'create_users',
  EDIT_USERS: 'edit_users',
  DELETE_USERS: 'delete_users',
  
  // Administracja systemu
  VIEW_ADMIN: 'view_admin',
  SYSTEM_SETTINGS: 'system_settings',
  MANAGE_DEPARTMENTS: 'manage_departments',
  MANAGE_POSITIONS: 'manage_positions',
  
  // Zarządzanie rolami
  MANAGE_ROLES: 'manage_roles',
  VIEW_ROLES: 'view_roles',
  
  // Audyt i logi
  VIEW_AUDIT_LOG: 'view_audit_log',
  
  // Analityka
  VIEW_ANALYTICS: 'view_analytics',

  // Narzędzia
  ACCESS_TOOLS: 'access_tools',

  // BHP
  VIEW_BHP: 'view_bhp',
  MANAGE_BHP: 'manage_bhp'
};

// Role użytkowników
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  HR: 'hr',
  USER: 'user'
};

// Statusy użytkowników
export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended'
};

// Statusy departamentów
export const DEPARTMENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

// Typy akcji w audycie
export const AUDIT_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  LOGOUT: 'logout',
  VIEW: 'view'
};

// Konfiguracja paginacji
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [5, 10, 20, 50, 100]
};

// Konfiguracja API
export const API_CONFIG = {
  BASE_URL: 'http://localhost:3000',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
};

// Endpointy API
export const API_ENDPOINTS = {
  // Autoryzacja
  LOGIN: '/api/auth/login',
  LOGOUT: '/api/auth/logout',
  REFRESH_TOKEN: '/api/auth/refresh',
  
  // Użytkownicy
  USERS: '/api/users',
  USER_BY_ID: (id) => `/api/users/${id}`,
  
  // Departamenty
  DEPARTMENTS: '/api/departments',
  DEPARTMENT_BY_ID: (id) => `/api/departments/${id}`,
  
  // Stanowiska
  POSITIONS: '/api/positions',
  POSITION_BY_ID: (id) => `/api/positions/${id}`,
  
  // Role
  ROLES: '/api/roles',
  ROLE_BY_ID: (id) => `/api/roles/${id}`,
  
  // Audyt
  AUDIT_LOG: '/api/audit',
  
  // Analityka
  ANALYTICS: '/api/analytics',
  
  // Konfiguracja aplikacji
  CONFIG: '/api/config'
};

// Komunikaty błędów
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Błąd połączenia z serwerem',
  UNAUTHORIZED: 'Brak uprawnień do wykonania tej operacji',
  FORBIDDEN: 'Dostęp zabroniony',
  NOT_FOUND: 'Nie znaleziono zasobu',
  VALIDATION_ERROR: 'Błąd walidacji danych',
  SERVER_ERROR: 'Błąd serwera',
  UNKNOWN_ERROR: 'Wystąpił nieznany błąd'
};

// Komunikaty sukcesu
export const SUCCESS_MESSAGES = {
  USER_CREATED: 'Użytkownik został utworzony pomyślnie',
  USER_UPDATED: 'Dane użytkownika zostały zaktualizowane',
  USER_DELETED: 'Użytkownik został usunięty',
  DEPARTMENT_CREATED: 'Departament został utworzony pomyślnie',
  DEPARTMENT_UPDATED: 'Departament został zaktualizowany',
  DEPARTMENT_DELETED: 'Departament został usunięty',
  POSITION_CREATED: 'Stanowisko zostało utworzone pomyślnie',
  POSITION_UPDATED: 'Stanowisko zostało zaktualizowane',
  POSITION_DELETED: 'Stanowisko zostało usunięte',
  SETTINGS_SAVED: 'Ustawienia zostały zapisane'
};

// Kolory motywu
export const THEME_COLORS = {
  PRIMARY: '#3b82f6',
  SECONDARY: '#64748b',
  SUCCESS: '#10b981',
  WARNING: '#f59e0b',
  ERROR: '#ef4444',
  INFO: '#06b6d4'
};

// Funkcja sprawdzająca uprawnienia użytkownika
export const hasPermission = (user, permission) => {
  if (!user || !user.role) {
    return false;
  }

  // Normalizacja nazw ról z różnych miejsc aplikacji
  const normalizeRole = (role) => {
    const r = String(role).toLowerCase();
    if (r === 'administrator' || r === 'admin') return ROLES.ADMIN;
    if (r === 'manager') return ROLES.MANAGER;
    // Traktuj 'employee' i 'viewer' jako użytkownika z uprawnieniami podglądu
    if (r === 'employee' || r === 'viewer' || r === 'user') return ROLES.USER;
    return r; // fallback: już zgodny z ROLES
  };

  const normalizedRole = normalizeRole(user.role);

  // Admin ma wszystkie uprawnienia
  if (normalizedRole === ROLES.ADMIN) {
    return true;
  }

  // Mapowanie ról do uprawnień
  const rolePermissions = {
    [ROLES.MANAGER]: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.CREATE_USERS,
      PERMISSIONS.EDIT_USERS,
      PERMISSIONS.VIEW_ANALYTICS,
      PERMISSIONS.ACCESS_TOOLS,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_POSITIONS,
      PERMISSIONS.VIEW_BHP,
      PERMISSIONS.MANAGE_BHP
    ],
    [ROLES.HR]: [
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.CREATE_USERS,
      PERMISSIONS.EDIT_USERS,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_POSITIONS
    ],
    [ROLES.USER]: [
      PERMISSIONS.ACCESS_TOOLS,
      PERMISSIONS.VIEW_USERS,
      PERMISSIONS.VIEW_ANALYTICS,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.VIEW_BHP
    ]
  };

  const userPermissions = rolePermissions[normalizedRole] || [];
  return userPermissions.includes(permission);
};