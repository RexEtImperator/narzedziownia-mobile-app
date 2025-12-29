import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api from './api';
import { setDynamicRolePermissions } from './constants';
import { hasPermission as checkPermissionStatic } from './utils';
import { KEYS, getJson, setJson } from './storage';

const PermissionsContext = createContext(null);

export const PermissionsProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [permissionsMap, setPermissionsMap] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // Funkcja odświeżająca uprawnienia (może być wywołana po zalogowaniu)
  const refreshPermissions = useCallback(async () => {
    try {
      setError(null);
      // 1. Load user
      const user = await getJson(KEYS.CURRENT_USER);
      setCurrentUser(user);

      // 2. Load dynamic permissions map
      let map = null;
      try {
        // Try backend first if online logic allows, but for now stick to cached/backend pattern
        // We can mimic App.js logic: load from storage, then update from API
        map = await getJson(KEYS.ROLE_PERMISSIONS);
      } catch {}

      if (map) {
        setPermissionsMap(map);
        setDynamicRolePermissions(map); // Update static module for non-hook usage
      }

      // 3. Background fetch from API
      if (api.token) {
        api.get('/api/role-permissions').then(async (perms) => {
          if (perms && typeof perms === 'object') {
            setPermissionsMap(perms);
            setDynamicRolePermissions(perms);
            await setJson(KEYS.ROLE_PERMISSIONS, perms);
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.log('Permissions load error', e);
      setError(e);
    } finally {
      setReady(true);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  // Wrapper for hasPermission that uses the current state (implicitly via re-render)
  // We use the static function but since we updated the module variable, it works.
  // Ideally, we would implement logic here to depend on 'permissionsMap' state directly.
  const hasPermission = useCallback((permission) => {
    // If user is not loaded yet, default to false (or handle loading)
    if (!currentUser) return false;
    // We pass currentUser to static check. 
    // The static check uses the module-level dynamicRolePermissions which we synced.
    return checkPermissionStatic(currentUser, permission);
  }, [currentUser, permissionsMap]); // dependency on permissionsMap ensures new reference when map updates

  const value = {
    currentUser,
    permissionsMap,
    ready,
    error,
    hasPermission,
    refreshPermissions
  };

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};
