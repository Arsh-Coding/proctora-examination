import { z } from 'zod';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { signAdminToken } from '../utils/token';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[a-z]/, 'Password needs a lowercase letter')
    .regex(/[A-Z]/, 'Password needs an uppercase letter')
    .regex(/\d/, 'Password needs a number'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body as z.infer<typeof registerSchema>;

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with that email already exists');

  const user = await User.create({ name, email, password, role: 'ADMIN' });
  const token = signAdminToken({ sub: user._id.toString(), email: user.email, role: 'ADMIN' });

  res.status(201).json({ success: true, data: { token, user: user.toSafeJSON() } });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  // `password` is `select: false` on the schema, so ask for it explicitly.
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const matches = await user.comparePassword(password);
  if (!matches) throw ApiError.unauthorized('Invalid email or password');

  const token = signAdminToken({ sub: user._id.toString(), email: user.email, role: user.role as 'ADMIN' });
  res.json({ success: true, data: { token, user: user.toSafeJSON() } });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.admin) throw ApiError.unauthorized();
  res.json({ success: true, data: { user: req.admin.toSafeJSON() } });
});
