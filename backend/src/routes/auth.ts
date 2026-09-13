import { Router, Response } from 'express';
import { pool } from '../db';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/jwt';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// ROUTE 1: POST /auth/register
router.post('/register', async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required', status: 400 });
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format', status: 400 });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters', status: 400 });
  }

  try {
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered', status: 409 });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, password_hash]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.json({
      status: 'registered',
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user', status: 500 });
  }
});

// ROUTE 2: POST /auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required', status: 400 });
  }

  try {
    // Lookup user
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password', status: 401 });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password', status: 401 });
    }

    // Generate token
    const token = generateToken(user.id);

    res.json({
      status: 'logged_in',
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Failed to login', status: 500 });
  }
});

// ROUTE 3: POST /auth/verify
router.post('/verify', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({
    status: 'valid',
    user_id: req.user?.user_id
  });
});

export default router;
