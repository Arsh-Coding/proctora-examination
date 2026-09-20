import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

mongoose.set('strictQuery', true);

export async function connectDatabase(): Promise<typeof mongoose> {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    });
    logger.info(`MongoDB connected -> ${conn.connection.name}`);
    return conn;
  } catch (error) {
    logger.error('MongoDB connection failed.', error);
    logger.error(
      'Is MongoDB running? Check MONGO_URI in server/.env (default mongodb://127.0.0.1:27017/proctora).'
    );
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
