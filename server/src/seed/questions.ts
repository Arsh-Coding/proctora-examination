/** 20 demo questions for the seeded "JavaScript Fundamentals" exam. */
export interface SeedQuestion {
  questionText: string;
  options: [string, string, string, string];
  /** 0-based index into `options`. */
  correctAnswer: number;
  marks: number;
}

export const javascriptFundamentals: SeedQuestion[] = [
  {
    questionText: 'What is Node.js?',
    options: [
      'A relational database',
      'A JavaScript runtime environment built on V8',
      'A programming language',
      'An operating system',
    ],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'Which keyword declares a block-scoped variable that cannot be reassigned?',
    options: ['var', 'let', 'const', 'static'],
    correctAnswer: 2,
    marks: 5,
  },
  {
    questionText: 'What does `typeof null` evaluate to in JavaScript?',
    options: ["'null'", "'object'", "'undefined'", "'number'"],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'Which method creates a new array with elements that pass a test?',
    options: ['Array.prototype.map', 'Array.prototype.filter', 'Array.prototype.forEach', 'Array.prototype.reduce'],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'What is the result of `[1, 2, 3] + [4]`?',
    options: ["'1,2,34'", '[1,2,3,4]', '10', 'TypeError'],
    correctAnswer: 0,
    marks: 5,
  },
  {
    questionText: 'Which comparison performs type coercion?',
    options: ['===', '==', 'Object.is', 'Number.isInteger'],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'What does a Promise in the "pending" state mean?',
    options: [
      'It has resolved with a value',
      'It has rejected with an error',
      'It is neither fulfilled nor rejected yet',
      'It was cancelled',
    ],
    correctAnswer: 2,
    marks: 5,
  },
  {
    questionText: 'Which statement about arrow functions is true?',
    options: [
      'They have their own `this` binding',
      'They inherit `this` from the enclosing lexical scope',
      'They can be used as constructors',
      'They always return undefined',
    ],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'What does `JSON.stringify(undefined)` return?',
    options: ["'undefined'", 'undefined', "'null'", 'An empty string'],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'Which loop is guaranteed to execute its body at least once?',
    options: ['for', 'while', 'do...while', 'for...of'],
    correctAnswer: 2,
    marks: 5,
  },
  {
    questionText: 'What is the purpose of `Array.prototype.reduce`?',
    options: [
      'To remove duplicate values',
      'To reduce an array to a single accumulated value',
      'To sort an array in place',
      'To reverse an array',
    ],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'Which of these is NOT a JavaScript primitive type?',
    options: ['symbol', 'bigint', 'array', 'boolean'],
    correctAnswer: 2,
    marks: 5,
  },
  {
    questionText: 'What does the spread syntax `...` do in `const copy = [...items]`?',
    options: [
      'Creates a deep clone of every nested object',
      'Creates a shallow copy of the array',
      'Mutates the original array',
      'Converts the array to a string',
    ],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'Which API is used to make HTTP requests natively in modern browsers?',
    options: ['fetch', 'require', 'import', 'eval'],
    correctAnswer: 0,
    marks: 5,
  },
  {
    questionText: 'What is a closure?',
    options: [
      'A function that has been garbage collected',
      'A function bundled with the lexical scope it was created in',
      'A way to close a browser tab',
      'A synchronous loop',
    ],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'What does `async` before a function declaration guarantee?',
    options: [
      'The function runs on a separate thread',
      'The function always returns a Promise',
      'The function cannot throw',
      'The function runs before all other code',
    ],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'Which method adds one or more elements to the end of an array?',
    options: ['unshift', 'push', 'shift', 'concat'],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'What is the event loop responsible for?',
    options: [
      'Compiling JavaScript to machine code',
      'Coordinating the call stack, task queues and rendering',
      'Managing CSS layout',
      'Encrypting network traffic',
    ],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'What does `Object.freeze(obj)` do?',
    options: [
      'Deletes all properties of obj',
      'Prevents new properties being added and existing ones changed',
      'Converts obj to JSON',
      'Creates a deep immutable clone',
    ],
    correctAnswer: 1,
    marks: 5,
  },
  {
    questionText: 'Which statement about `let` inside a `for` loop is correct?',
    options: [
      'It creates one binding shared by all iterations',
      'It creates a new binding for each iteration',
      'It is hoisted to the top of the function',
      'It is not allowed in loops',
    ],
    correctAnswer: 1,
    marks: 5,
  },
];
