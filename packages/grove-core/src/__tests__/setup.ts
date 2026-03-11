/**
 * Vitest setup file for grove-core tests.
 * Mocks the vscode module since it's not available outside VS Code.
 */
import { vi } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
  languages: {
    createDiagnosticCollection: vi.fn(() => ({
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    })),
    createLanguageStatusItem: vi.fn(() => ({
      text: "",
      detail: "",
      severity: 0,
      dispose: vi.fn(),
    })),
  },
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showOpenDialog: vi.fn(),
    withProgress: vi.fn((options, task) => task({ report: vi.fn() })),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: "file", path }),
    parse: (uri: string) => ({ fsPath: uri, scheme: "file", path: uri }),
  },
  Range: class {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number,
    ) {}
  },
  Position: class {
    constructor(
      public line: number,
      public character: number,
    ) {}
  },
  Diagnostic: class {
    constructor(
      public range: unknown,
      public message: string,
      public severity: number,
    ) {}
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  LanguageStatusSeverity: {
    Information: 0,
    Warning: 1,
    Error: 2,
  },
  ProgressLocation: {
    Notification: 15,
    Window: 10,
    SourceControl: 1,
  },
  ExtensionContext: class {},
}));

