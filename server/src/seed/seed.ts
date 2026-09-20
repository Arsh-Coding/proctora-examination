/**
 * Development seed script.
 *
 * Creates a demo admin account and a demo exam so the app is usable the moment
 * it boots. The credentials below are DEVELOPMENT/DEMO ONLY - never ship them.
 *
 *   npm run seed              (from server/, or `npm run seed` from the repo root)
 *   npm run seed -- --reset   wipes exams, sessions and violations first
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { Exam } from '../models/Exam';
import { ExamSession } from '../models/ExamSession';
import { User } from '../models/User';
import { Violation } from '../models/Violation';
import { logger } from '../utils/logger';
import { javascriptFundamentals } from './questions';

/* ----------------- DEMO CREDENTIALS - DEVELOPMENT ONLY ------------------ */
/**
 * These defaults are published in the README, so they are safe locally and
 * unsafe anywhere reachable. Override them when seeding a deployed database:
 *
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='...' npm run seed
 */
const DEFAULT_DEMO_ADMIN = {
  name: 'PROCTORA Admin',
  email: 'admin@proctora.local',
  password: 'Admin@123',
};

const ADMIN = {
  name: process.env.SEED_ADMIN_NAME ?? DEFAULT_DEMO_ADMIN.name,
  email: (process.env.SEED_ADMIN_EMAIL ?? DEFAULT_DEMO_ADMIN.email).toLowerCase(),
  password: process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_DEMO_ADMIN.password,
};

const usingPublishedCredentials =
  ADMIN.email === DEFAULT_DEMO_ADMIN.email && ADMIN.password === DEFAULT_DEMO_ADMIN.password;
/* ----------------------------------------------------------------------- */

const DEMO_EXAM_TITLE = 'JavaScript Fundamentals';

async function seed() {
  const reset = process.argv.includes('--reset');

  await connectDatabase();

  if (reset) {
    logger.warn('--reset passed: clearing exams, sessions and violations.');
    await Promise.all([
      Exam.deleteMany({}),
      ExamSession.deleteMany({}),
      Violation.deleteMany({}),
    ]);
  }

  let admin = await User.findOne({ email: ADMIN.email });
  if (admin) {
    logger.info(`Admin already exists (${ADMIN.email}), resetting its password.`);
    admin.password = ADMIN.password; // re-hashed by the pre-save hook
    admin.name = ADMIN.name;
    admin.role = 'ADMIN';
    await admin.save();
  } else {
    admin = await User.create({ ...ADMIN, role: 'ADMIN' });
    logger.info(`Created admin ${ADMIN.email}`);
  }

  let exam = await Exam.findOne({ title: DEMO_EXAM_TITLE, createdBy: admin._id });
  if (exam) {
    exam.description =
      'A 20 question multiple-choice check on core JavaScript concepts. Seeded demo exam.';
    exam.duration = 30;
    exam.isActive = true;
    exam.set('questions', javascriptFundamentals);
    await exam.save();
    logger.info(`Updated demo exam "${DEMO_EXAM_TITLE}"`);
  } else {
    exam = await Exam.create({
      title: DEMO_EXAM_TITLE,
      description:
        'A 20 question multiple-choice check on core JavaScript concepts. Seeded demo exam.',
      duration: 30,
      isActive: true,
      questions: javascriptFundamentals,
      createdBy: admin._id,
    });
    logger.info(`Created demo exam "${DEMO_EXAM_TITLE}"`);
  }

  const totalMarks = exam.questions.reduce((sum, q) => sum + q.marks, 0);

  const examLink = `${env.CLIENT_URL.replace(/\/$/, '')}/exam/${exam._id.toString()}`;

  console.log('\n============================================================');
  console.log(' PROCTORA seed complete');
  console.log('============================================================');
  console.log(' ADMIN ACCOUNT');
  console.log(`   Email:    ${ADMIN.email}`);
  if (usingPublishedCredentials) {
    console.log(`   Password: ${ADMIN.password}`);
  } else {
    console.log('   Password: (taken from SEED_ADMIN_PASSWORD, not printed)');
  }
  console.log('');
  console.log(' DEMO EXAM');
  console.log(`   Title:      ${exam.title}`);
  console.log(`   Duration:   ${exam.duration} minutes`);
  console.log(`   Questions:  ${exam.questions.length}`);
  console.log(`   Total marks:${totalMarks}`);
  console.log(`   Exam id:    ${exam._id.toString()}`);
  console.log(`   Exam link:  ${examLink}`);
  console.log('============================================================\n');

  // The default credentials are published in the README. Seeding them into a
  // database that is not on this machine hands the console to anyone.
  const isLocalDatabase = /(localhost|127\.0\.0\.1)/.test(env.MONGO_URI);
  if (usingPublishedCredentials && (!isLocalDatabase || env.isProduction)) {
    logger.warn('');
    logger.warn('  !!  This database is not local, and you just seeded the credentials');
    logger.warn('  !!  that are published in the README. Anyone who reads it can sign in');
    logger.warn('  !!  and view every candidate answer and violation.');
    logger.warn('  !!');
    logger.warn('  !!  Re-run with your own values, then delete this account:');
    logger.warn('  !!    SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=... npm run seed');
    logger.warn('');
  }

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch(async (error) => {
    logger.error('Seed failed:', error);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
