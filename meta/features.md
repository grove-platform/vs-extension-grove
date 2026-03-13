# Features to Develop

## Snippets and includes

- Extend "references" CodeLens feature to includes and literalincludes
  - Will need to be careful with performance
- Fix tested snippet code lens to point to actual test file and create a new one for "source" file that contains bluehawk markup
- In the Atlas docs, what are `extracts`? File paths fail for stuff like this:

  ```
    .. selected-content::
        :selections: api-key, atlas-cli

        .. include:: /includes/extracts/atlas-projects-apiKeys-list.rst

        You can view the |api| access list entries for a project
        |api| key using an ``atlas organizations`` command.

        .. include:: /includes/extracts/atlas-organizations-apiKeys-accessLists-list.rst
  ```

  Because the `extracts` directory seems to not exist. But there is content in the live site. For example, this source page: /Users/kyle.rollins/Documents/GitHub/docs-mongodb-internal/content/atlas/source/configure-api-access-project.txt
  and this production page: https://www.mongodb.com/docs/atlas/configure-api-access-project/?programmatic-access=api-key&interface=atlas-cli

## Performance

- Ways to gracefully lazy load extension features to improve start up time?
- Optimize build

## Security

- Do a full security audit
