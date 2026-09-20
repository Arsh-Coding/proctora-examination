import type { QuestionDraft } from '../types';

/** A blank multiple-choice question for the exam builder. */
export function emptyQuestion(): QuestionDraft {
  return { questionText: '', options: ['', '', '', ''], correctAnswer: 0, marks: 1 };
}
