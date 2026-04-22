import { describe, expect, it } from "vitest";
import { parseDirectives } from "../rst/directive-parser";

function makeDocument(text: string) {
  const lines = text.split("\n");
  return {
    lineCount: lines.length,
    lineAt: (line: number) => ({ text: lines[line] }),
  } as never;
}

describe("parseDirectives code-block parsing", () => {
  it("skips code-block options and captures only the code body", () => {
    const document = makeDocument(
      [
        ".. code-block:: python",
        "   :linenos:",
        "   :caption: Example",
        "",
        "   print('hello')",
        "   if True:",
        "       print('nested')",
        "",
        "Paragraph text.",
      ].join("\n"),
    );

    const refs = parseDirectives(document);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.type).toBe("code-block");
    expect(refs[0]?.language).toBe("python");
    expect(refs[0]?.code).toBe(
      ["print('hello')", "if True:", "    print('nested')"].join("\n"),
    );
  });

  it("supports c# code-block language identifiers", () => {
    const document = makeDocument(
      [".. code-block:: c#", "", '   Console.WriteLine("hello");'].join("\n"),
    );

    const refs = parseDirectives(document);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.language).toBe("c#");
    expect(refs[0]?.code).toBe('Console.WriteLine("hello");');
  });

  it("preserves nested indentation and blank lines in code content", () => {
    const document = makeDocument(
      [
        ".. code-block:: json",
        "",
        "   {",
        '     "parent": {',
        '       "child": 1',
        "     }",
        "   }",
        "",
        "   // trailing blank above should be trimmed",
        "",
        "Next section",
      ].join("\n"),
    );

    const refs = parseDirectives(document);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.language).toBe("json");
    expect(refs[0]?.code).toBe(
      [
        "{",
        '  "parent": {',
        '    "child": 1',
        "  }",
        "}",
        "",
        "// trailing blank above should be trimmed",
      ].join("\n"),
    );
  });
});
