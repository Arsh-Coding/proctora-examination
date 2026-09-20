import bcrypt from 'bcryptjs';
import mongoose, { Schema } from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';

export const USER_ROLES = ['ADMIN', 'CANDIDATE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(plain: string): Promise<boolean>;
  toSafeJSON(): { id: string; name: string; email: string; role: UserRole; createdAt: Date };
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, {}, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // `select: false` keeps the hash out of every query result by default.
    password: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'ADMIN' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(plain: string) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model<IUser, UserModel>('User', userSchema);
