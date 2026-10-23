import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect, cookies }) => {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') || '/';

  const issuer = process.env.MALI_CONNECT_ISSUER || 'https://connect.malihub.digital/application/o/jobavenir/';
  const clientId = process.env.MALI_CONNECT_CLIENT_ID || 'jobavenir-malihub';
  const callbackUrl = process.env.MALI_CONNECT_REDIRECT_URI || `${url.origin}/api/auth/callback`;

  // Génération d'un state aléatoire pour la protection CSRF
  const stateBytes = new Uint8Array(16);
  crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  // Stocker le state et l'URL de retour dans un cookie sécurisé temporaire
  cookies.set('mali_connect_oauth_state', JSON.stringify({ state, returnTo }), {
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 60 * 10 // 10 minutes
  });

  const authUrl = new URL('https://connect.malihub.digital/application/o/authorize/');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);

  return redirect(authUrl.toString(), 302);
};
