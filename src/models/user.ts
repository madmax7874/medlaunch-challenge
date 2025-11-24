import globalRepo from '../repositories/globalRepository';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // hashed password
  role: Role;
}

export function findByEmail(email: string): User | undefined {
  return globalRepo.users.findByEmail(email);
}

export function validateCreds(email: string, password: string): User | null {
  const u = globalRepo.users.findByEmail(email);
  if (!u) return null;
  const ok = bcrypt.compareSync(password, u.password);
  return ok ? u : null;
}

export function createUser(name: string, email: string, password: string, role: Role = 'USER'): User {
  // uniqueness
  const exists = globalRepo.users.findByEmail(email);
  if (exists) {
    const err: any = new Error('EmailExists');
    throw err;
  }

  // password policy: min 6 chars, upper, lower, digit, special
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{6,}$/;
  if (!re.test(password)) {
    const err: any = new Error('PasswordDoesNotMeetPolicy');
    throw err;
  }

  const hashed = bcrypt.hashSync(password, 10);
  const user: User = { id: randomUUID(), name, email, password: hashed, role };
  globalRepo.users.add(user);
  return user;
}

export function listUsers(): User[] {
  return globalRepo.users.list();
}
