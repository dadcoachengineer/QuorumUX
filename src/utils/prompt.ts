/**
 * Interactive Prompt Utilities
 *
 * Zero-dependency readline wrappers for the init wizard.
 */

import * as readline from 'readline';

let rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

/** Close the readline interface when done */
export function closePrompt(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/** Ask a free-text question. Returns the trimmed answer. */
export function ask(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    getRL().question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/** Ask a yes/no question. Returns boolean. */
export function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return new Promise((resolve) => {
    getRL().question(`${question} (${hint}): `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === '') resolve(defaultYes);
      else resolve(a === 'y' || a === 'yes');
    });
  });
}

/** Show numbered choices and return the selected value. */
export function select<T extends string>(
  question: string,
  choices: Array<{ label: string; value: T; description?: string }>
): Promise<T> {
  return new Promise((resolve) => {
    console.log(`\n${question}`);
    for (let i = 0; i < choices.length; i++) {
      const desc = choices[i].description ? ` — ${choices[i].description}` : '';
      console.log(`  ${i + 1}) ${choices[i].label}${desc}`);
    }

    const promptFn = () => {
      getRL().question(`\nChoice (1-${choices.length}): `, (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= choices.length) {
          resolve(choices[num - 1].value);
        } else {
          console.log(`  Please enter a number between 1 and ${choices.length}`);
          promptFn();
        }
      });
    };
    promptFn();
  });
}

/** Show numbered choices and return multiple selected values. */
export function multiSelect<T extends string>(
  question: string,
  choices: Array<{ label: string; value: T; description?: string }>
): Promise<T[]> {
  return new Promise((resolve) => {
    console.log(`\n${question}`);
    for (let i = 0; i < choices.length; i++) {
      const desc = choices[i].description ? ` — ${choices[i].description}` : '';
      console.log(`  ${i + 1}) ${choices[i].label}${desc}`);
    }

    const promptFn = () => {
      getRL().question(`\nChoices (comma-separated, e.g. 1,3,5): `, (answer) => {
        const nums = answer
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => n >= 1 && n <= choices.length);

        if (nums.length > 0) {
          resolve(nums.map((n) => choices[n - 1].value));
        } else {
          console.log(`  Please enter valid numbers separated by commas`);
          promptFn();
        }
      });
    };
    promptFn();
  });
}
