/**
 * Grove Core extension API surface exposed to language child extensions.
 * Keep in sync with grove-core/src/test-runner-api.ts.
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
}

export interface GroveCoreApi {
  registerTestRunner(runner: GroveTestRunnerRegistration): void;
}
