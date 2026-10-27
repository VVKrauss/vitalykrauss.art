import { APIError } from 'better-auth/api';
import { passkey } from '@better-auth/passkey';

export function createAuthOptions(config, db) {
  return {
    appName: 'Vitaly Krauss Studio',
    database: db,
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [config.baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 14,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
      freshAge: 60 * 10,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: new URL(config.baseURL).protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      crossSubDomainCookies: { enabled: false },
      // Overwritten by our HTTP adapter from the socket / explicitly trusted proxy, never from client input.
      ipAddress: { ipAddressHeaders: ['x-studio-client-ip'] },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/passkey/verify-authentication': { window: 60, max: 5 } },
    },
    databaseHooks: {
      session: {
        create: {
          before: async session => {
            const user = db.prepare('SELECT email, emailVerified FROM user WHERE id = ?').get(session.userId);
            if (!user || user.email.toLowerCase() !== config.ownerEmail || !user.emailVerified) {
              throw new APIError('FORBIDDEN', { message: 'Access denied' });
            }
            return { data: session };
          },
        },
      },
    },
    plugins: [passkey({
      rpID: new URL(config.baseURL).hostname,
      rpName: 'Vitaly Krauss Studio',
      origin: config.baseURL,
    })],
    telemetry: { enabled: false },
    logger: { level: 'error' },
  };
}
