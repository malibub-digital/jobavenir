import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect, cookies }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  // Récupérer et valider le state CSRF
  const storedStateCookie = cookies.get('mali_connect_oauth_state')?.value;
  let returnTo = '/';

  if (!code || !returnedState || !storedStateCookie) {
    return redirect('/login?error=invalid_request', 302);
  }

  try {
    const parsed = JSON.parse(storedStateCookie);
    if (parsed.state !== returnedState) {
      return redirect('/login?error=state_mismatch', 302);
    }
    if (parsed.returnTo && parsed.returnTo.startsWith('/')) {
      returnTo = parsed.returnTo;
    }
  } catch {
    return redirect('/login?error=invalid_state', 302);
  }

  // Nettoyer le cookie d'état OAuth
  cookies.delete('mali_connect_oauth_state', { path: '/' });

  const clientId = process.env.MALI_CONNECT_CLIENT_ID || 'jobavenir-malihub';
  const clientSecret = process.env.MALI_CONNECT_CLIENT_SECRET || '3Tzfw5Yw2t2O7cukOJU6K12uWQ50lVAmwtYV21bpMo0';
  const callbackUrl = process.env.MALI_CONNECT_REDIRECT_URI || `${url.origin}/api/auth/callback`;

  // Échange du code d'autorisation contre les jetons auprès d'Authentik
  const tokenUrl = 'https://connect.malihub.digital/application/o/token/';
  const bodyParams = new URLSearchParams();
  bodyParams.set('grant_type', 'authorization_code');
  bodyParams.set('client_id', clientId);
  bodyParams.set('client_secret', clientSecret);
  bodyParams.set('code', code);
  bodyParams.set('redirect_uri', callbackUrl);

  try {
    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error('Erreur échange token Authentik:', errText);
      return redirect('/login?error=token_exchange_failed', 302);
    }

    const tokenData = await tokenResp.json();
    const { access_token, id_token } = tokenData;

    // Récupérer le profil utilisateur depuis l'endpoint userinfo
    const userinfoResp = await fetch('https://connect.malihub.digital/application/o/userinfo/', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    let userInfo: Record<string, any> = {};
    if (userinfoResp.ok) {
      userInfo = await userinfoResp.json();
    }

    // Créer la session utilisateur
    const userSession = {
      sub: userInfo.sub,
      name: userInfo.name || userInfo.preferred_username || 'Citoyen',
      email: userInfo.email,
      email_verified: userInfo.email_verified,
      groups: userInfo.groups || [],
      roles: userInfo.roles || [],
      id_token
    };

    // Déposer le cookie de session utilisateur
    cookies.set('mali_connect_user', JSON.stringify(userSession), {
      path: '/',
      httpOnly: false, // Accessible par le frontend pour afficher le profil
      secure: url.protocol === 'https:',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 jours
    });

    // Également déposer le cookie d'administration compatible avec le CMS si l'utilisateur est admin
    const isAdmin =
      userSession.groups.includes('authentik Admins') ||
      userSession.groups.some((g: string) => g.includes('admin') || g.includes('editor')) ||
      userSession.email === 'sylvaintoe@gmail.com';

    if (isAdmin) {
      cookies.set('cms_admin_token', 'mali_connect_authenticated', {
        path: '/',
        httpOnly: false,
        secure: url.protocol === 'https:',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7
      });
    }

    return redirect(returnTo, 302);
  } catch (error) {
    console.error('Exception pendant le callback auth:', error);
    return redirect('/login?error=server_error', 302);
  }
};
