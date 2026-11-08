import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_must_be_strong_and_32_characters_minimum';

export interface UserJwtPayload {
  userId: string;
  fullName: string;
  isPlatformAdmin?: boolean;
}

export function signAccessToken(payload: UserJwtPayload, expiresIn = '15m'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): UserJwtPayload {
  return jwt.verify(token, JWT_SECRET) as UserJwtPayload;
}
