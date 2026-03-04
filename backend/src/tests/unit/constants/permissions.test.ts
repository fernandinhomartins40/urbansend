import { expandGrantedPermissions, hasPermission } from '../../../constants/permissions';

describe('permissions', () => {
  it('expands manage permissions into read/write permissions', () => {
    const expanded = expandGrantedPermissions(['domain:manage', 'template:manage']);

    expect(expanded.includes('domain:manage')).toBe(true);
    expect(expanded.includes('domain:read')).toBe(true);
    expect(expanded.includes('domain:write')).toBe(true);
    expect(expanded.includes('template:read')).toBe(true);
    expect(expanded.includes('template:write')).toBe(true);
  });

  it('treats admin as the umbrella permission for admin routes', () => {
    expect(hasPermission(['admin'], 'admin:keys')).toBe(true);
    expect(hasPermission(['admin'], 'admin:dkim')).toBe(true);
  });

  it('does not allow unrelated permissions', () => {
    expect(hasPermission(['email:read'], 'email:send')).toBe(false);
    expect(hasPermission(['workspace:read'], 'workspace:write')).toBe(false);
  });
});
