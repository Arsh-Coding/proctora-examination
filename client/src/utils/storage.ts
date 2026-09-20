/**
 * Typed localStorage helpers. Every access is guarded because private browsing
 * modes can throw on read/write.
 */

const ADMIN_TOKEN_KEY = 'proctora.admin.token';
const SESSION_PREFIX = 'proctora.session.';

export interface StoredExamSession {
  sessionToken: string;
  sessionId: string;
  examId: string;
  candidateName: string;
  candidateEmail: string;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable - the app still works, just without restore */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const adminTokenStore = {
  get: () => safeGet(ADMIN_TOKEN_KEY),
  set: (token: string) => safeSet(ADMIN_TOKEN_KEY, token),
  clear: () => safeRemove(ADMIN_TOKEN_KEY),
};

/** One stored attempt per exam id, so a refresh can resume the right session. */
export const examSessionStore = {
  get(examId: string): StoredExamSession | null {
    const raw = safeGet(SESSION_PREFIX + examId);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredExamSession;
      if (!parsed?.sessionToken || !parsed?.sessionId) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  set(examId: string, value: StoredExamSession) {
    safeSet(SESSION_PREFIX + examId, JSON.stringify(value));
  },
  clear(examId: string) {
    safeRemove(SESSION_PREFIX + examId);
  },
};
