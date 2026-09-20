import type { UserDocument } from '../models/User';
import type { SessionTokenPayload } from '../utils/token';

declare global {
  namespace Express {
    interface Request {
      /** Populated by `requireAuth` for authenticated admin requests. */
      admin?: UserDocument;
      /** Populated by `requireSession` for candidate exam-session requests. */
      sessionToken?: SessionTokenPayload;
    }
  }
}

export {};
