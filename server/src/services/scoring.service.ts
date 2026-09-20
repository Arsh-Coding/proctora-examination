import type { IAnswer } from '../models/ExamSession';
import type { IQuestion } from '../models/Exam';

export interface ScoreResult {
  score: number;
  totalMarks: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
}

/**
 * Marks a submission. One mark bucket per question; wrong and blank both score 0
 * (no negative marking in the MVP).
 */
export function scoreSession(
  questions: Array<Pick<IQuestion, '_id' | 'correctAnswer' | 'marks'>>,
  answers: Array<Pick<IAnswer, 'questionId' | 'selectedOption'>>
): ScoreResult {
  const answerByQuestion = new Map<string, number | null>();
  for (const answer of answers) {
    answerByQuestion.set(answer.questionId.toString(), answer.selectedOption);
  }

  let score = 0;
  let totalMarks = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const question of questions) {
    totalMarks += question.marks;
    const selected = answerByQuestion.get(question._id.toString());

    if (selected === undefined || selected === null) {
      unansweredCount += 1;
      continue;
    }
    if (selected === question.correctAnswer) {
      score += question.marks;
      correctCount += 1;
    } else {
      incorrectCount += 1;
    }
  }

  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0;

  return { score, totalMarks, percentage, correctCount, incorrectCount, unansweredCount };
}
