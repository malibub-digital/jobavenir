import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect }) => {
  // Supprimer les cookies de session
  cookies.delete('mali_connect_user', { path: '/' });
  cookies.delete('cms_admin_token', { path: '/' });
  cookies.delete('mali_connect_oauth_state', { path: '/' });

  // Redirection vers la page d'accueil ou déconnexion globale Authentik
  const endSessionUrl = 'https://connect.malihub.digital/application/o/jobavenir/end-session/';
  return redirect(endSessionUrl, 302);
};
