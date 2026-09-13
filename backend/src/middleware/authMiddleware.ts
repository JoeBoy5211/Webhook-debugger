import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export interface AuthRequest extends Request {
  user?: { user_id: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'No token provided', status: 401 });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: 'Invalid token', status: 401 });
    return;
  }

  req.user = decoded;
  next();
}
