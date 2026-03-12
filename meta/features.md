# Features to Develop

## Snippets

- Code Lens for bluehawk snippets. If a snippet file exists, show all places where the snippet is used in rST directives.
  - For example: `// :snippet-start: set-coll-options` would point to this directive in an rST file:
    ```
      .. literalinclude:: /code-examples/tested/javascript/driver/time-series/quick-start/quick-start-setup.snippet.set-coll-options.js
         :language: javascript
         :copyable: true
         :category: syntax example
    ```
- Extend Code Lens support to all rST directives that reference files.
