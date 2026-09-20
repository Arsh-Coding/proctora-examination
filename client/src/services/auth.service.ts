import { api, unwrap } from './api';
import type { AuthUser } from '../types';

interface AuthResult {
  token: string;
  user: AuthUser;
}

export const authService = {
  login(email: string, password: string) {
    return unwrap<AuthResult>(api.post('/auth/login', { email, password }));
  },

  register(name: string, email: string, password: string) {
    return unwrap<AuthResult>(api.post('/auth/register', { name, email, password }));
  },

  me() {
    return unwrap<{ user: AuthUser }>(api.get('/auth/me'));
  },
};
