# Repository Guidelines

This repository contains community nodes for **n8n** written in TypeScript.

## Coding conventions

- Write all comments and error messages in **English**.
- Follow the existing lint and prettier configuration. Run:
  - `npm run lint`
  - `npm run format`
  before committing.
- Use strict TypeScript types. Avoid `any` and prefer explicit interfaces or generics.
- Follow n8n community node best practices:
  - Node classes should implement `INodeType` and expose a `description` property.
  - Use `NodeOperationError` for error handling.
  - Keep node parameters descriptive and typed.
  - Use `this.helpers.returnJsonArray` for returning data.
  - Credentials and icons belong in the `credentials` and `nodes` folders and are copied during `npm run build`.

## Development process

- Run `npm test` and `npm run lint` before each commit. Both should pass with no errors.
- Format new or changed files with `npm run format`.
- Do not leave TODO comments or placeholders in the code.

These guidelines apply to all files in the repository.
