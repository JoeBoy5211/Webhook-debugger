import jwt from 'jsonwebtoken';

export function generateToken(user_id: string): string {
  const secret = process.env.JWT_SECRET || 'default_secret_change_in_production';
  return jwt.sign({ user_id }, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): { user_id: string } | null {
  try {
    const secret = process.env.JWT_SECRET || 'default_secret_change_in_production';
    const decoded = jwt.verify(token, secret) as { user_id: string };
    return decoded;
  } catch (error) {
    return null;
  }
}
