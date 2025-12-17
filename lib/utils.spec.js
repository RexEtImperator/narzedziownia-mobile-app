import { describe, it, expect } from 'vitest';
import { isAdmin, hasRole, getUserRole } from './utils';

describe('utils: role helpers', () => {
  it('isAdmin returns true for admin/administrator', () => {
    expect(isAdmin({ role: 'admin' })).toBe(true);
    expect(isAdmin({ role: 'administrator' })).toBe(true);
    expect(isAdmin({ role: 'user' })).toBe(false);
  });

  it('hasRole compares case-insensitively', () => {
    expect(hasRole({ role: 'Admin' }, 'admin')).toBe(true);
    expect(hasRole({ role: 'USER' }, 'user')).toBe(true);
    expect(hasRole({ role: 'user' }, 'manager')).toBe(false);
  });

  it('getUserRole normalizes role to lower-case', () => {
    expect(getUserRole({ role: 'ADMIN' })).toBe('admin');
    expect(getUserRole({ role: 'User' })).toBe('user');
    expect(getUserRole(null)).toBe(null);
  });
});

