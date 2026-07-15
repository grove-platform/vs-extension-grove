/**
 * Grove Core extension API surface exposed to language child extensions.
 * Keep in sync with grove-core/src/test-runner-api.ts and test-execution.ts.
 */
export interface GroveTestRunOptions {
  projectPath: string;
  testFile?: string;
  timeout?: number;
  testNamePattern?: string;
  env?: Record<string, string>;
}

export interface GroveTestResult {
  success: boolean;
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  output?: string;
  duration: number;
}

export interface GroveTestRunnerRegistration {
  language: string;
  name: string;
  run: (options: GroveTestRunOptions) => Promise<GroveTestResult>;
  detect: (projectPath: string) => Promise<boolean>;
  /** When set, Grove Core validates the active file before runTestFile commands. */
  isRunnableTestFile?: (filePath: string, scheme?: string) => boolean;
}

export interface GroveRunTestsOptions {
  /** Grove language id (e.g. csharp, nodejs, python). Omit for language-aware core commands. */
  language?: string;
  /** Absolute path to the active editor file, when running a single file. */
  activeFilePath?: string;
  /** URI scheme for activeFilePath (defaults to file). */
  documentScheme?: string;
  /** When true, run only the active file (requires activeFilePath). */
  testFileScope?: boolean;
  testNamePattern?: string;
}

export interface GroveCoreApi {
  registerTestRunner(runner: GroveTestRunnerRegistration): void;
  /** Run tests through Grove Core (.env, UI connection, shared output). */
  runGroveTests(options: GroveRunTestsOptions): Promise<void>;
}
