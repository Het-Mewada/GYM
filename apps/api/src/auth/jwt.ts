import jwt from 'jsonwebtoken';

export const JWT_ALGORITHM: jwt.Algorithm = 'HS256';
export const JWT_ISSUER = 'gym-saas-api';
export const JWT_AUDIENCE = 'gym-saas-app';
export const MIN_SECRET_LENGTH = 32;

export function getJwtSecrets(): { primarySecret: string; verificationSecrets: string[] } {
  const primarySecret = process.env.JWT_SECRET || 'dev_jwt_secret_must_be_strong_and_32_characters_minimum';
  if (primarySecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long (got ${primarySecret.length})`);
  }

  const previousSecret = process.env.JWT_SECRET_PREVIOUS;
  const verificationSecrets = [primarySecret];
  if (previousSecret && previousSecret.length >= MIN_SECRET_LENGTH) {
    verificationSecrets.push(previousSecret);
  }

  return { primarySecret, verificationSecrets };
}

export interface UserJwtPayload {
  userId: string;
  fullName: string;
  isPlatformAdmin?: boolean;
}

export function signAccessToken(payload: UserJwtPayload, expiresIn = '15m'): string {
  const { primarySecret } = getJwtSecrets();
  return jwt.sign(
    {
      userId: payload.userId,
      fullName: payload.fullName,
      isPlatformAdmin: !!payload.isPlatformAdmin
    },
    primarySecret,
    {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: payload.userId,
      expiresIn
    } as jwt.SignOptions
  );
}

export function verifyAccessToken(token: string): UserJwtPayload {
  const { verificationSecrets } = getJwtSecrets();
  let lastError: Error | null = null;

  for (const secret of verificationSecrets) {
    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      }) as jwt.JwtPayload & UserJwtPayload;

      return {
        userId: decoded.userId || decoded.sub as string,
        fullName: decoded.fullName,
        isPlatformAdmin: decoded.isPlatformAdmin
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('Token verification failed');
}
