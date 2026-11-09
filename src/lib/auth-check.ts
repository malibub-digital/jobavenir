export function isUserAdmin(request: Request, cookies: any): boolean {
  // 1. Vérification cookie cms_admin_token ou ml_admin_token
  const cmsAdminToken = cookies.get('cms_admin_token')?.value;
  const mlAdminToken = cookies.get('ml_admin_token')?.value;
  if (cmsAdminToken && cmsAdminToken.length > 0) return true;
  if (mlAdminToken && mlAdminToken.length > 0) return true;

  // 2. Cookie session SSO Mali Connect
  const maliConnectUserCookie = cookies.get('mali_connect_user')?.value;
  if (maliConnectUserCookie) {
    try {
      const userSession = JSON.parse(decodeURIComponent(maliConnectUserCookie));
      const groups: string[] = userSession.groups || [];
      const email: string = userSession.email || '';
      if (
        groups.includes('authentik Admins') ||
        groups.some((g: string) => g.toLowerCase().includes('admin') || g.toLowerCase().includes('editor')) ||
        email === 'sylvaintoe@gmail.com'
      ) {
        return true;
      }
    } catch {
      // Ignorer erreur JSON
    }
  }

  // 3. Fallback header direct cookie (SSR context)
  const cookieHeader = request.headers.get('cookie') || '';
  if (/(?:cms_admin_token|ml_admin_token)=([^;]+)/.test(cookieHeader)) {
    return true;
  }

  return false;
}
