export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 处理 /login POST
  if (pathname === '/login' && request.method === 'POST') {
    const password = process.env.PASSWORD;
    if (!password) {
      return fetch(request);
    }

    try {
      const formData = await request.formData();
      const pwd = formData.get('password');

      if (pwd === password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pwd);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const headers = new Headers(request.headers);
        headers.append('Set-Cookie', `auth=${hash}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`);

        return new Response('OK', { status: 200, headers });
      } else {
        return new Response('Unauthorized', { status: 401 });
      }
    } catch (error) {
      return new Response('Bad Request', { status: 400 });
    }
  }

  // 静态资源、login.html 直接放行
  const isStaticAsset = /\.\w+$/.test(pathname) || pathname === '/favicon.ico' || pathname === '/robots.txt';
  const isLoginPage = pathname === '/login.html';

  if (isStaticAsset || isLoginPage) {
    return fetch(request);
  }

  // 无密码，直接放行
  const password = process.env.PASSWORD;
  if (!password) {
    return fetch(request);
  }

  // 检查 cookie 中的 auth hash
  const cookieHeader = request.headers.get('Cookie');
  let authHash = '';
  if (cookieHeader) {
    const match = cookieHeader.match(/auth=([a-f0-9]{64})/);
    if (match) {
      authHash = match[1];
    }
  }

  // 计算预期 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const expectedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // 验证通过，放行
  if (authHash === expectedHash) {
    return fetch(request);
  }

  // 未授权，重定向到登录页
  return Response.redirect(new URL('/login.html', request.url), 302);
}