import { Request, Response } from 'express';
import { validateCreds, createUser } from '../models/user';
import { signToken } from '../middleware/auth';

export function login(req: Request, res: Response) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  const user = validateCreds(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}


export function signup(req: Request, res: Response) {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing name, email or password' });

  try {
    const user = createUser(name, email, password);
    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    return res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err: any) {
    if (err && err.message === 'PasswordDoesNotMeetPolicy') {
      return res.status(400).json({ error: 'WeakPassword', message: 'Password must be at least 6 characters and include uppercase, lowercase, number, and special character' });
    }
    if (err && err.message === 'EmailExists') {
      return res.status(409).json({ error: 'This email already exists' });
    }
    return res.status(500).json({ error: 'InternalError', message: err.message });
  }
}
