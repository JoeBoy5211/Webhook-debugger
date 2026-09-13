import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Error:`, err.message);
  console.error(err.stack);

  const statusCode = (err as any).statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    status: statusCode
  });
}
