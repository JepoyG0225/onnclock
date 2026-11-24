# Feature and module permission requirements

For every new feature, module, page, or privileged action:
- Update `PAGE_PERMISSIONS` in `src/lib/auth/permissions.ts` so it appears in the company role-permissions checklist. Add explicit `paths` for new module routes.
- Reuse an existing permission only if the access scope is intentionally shared. Otherwise add the permission to the type, full catalog, appropriate built-in defaults, and configurable role validation.
- Keep sidebar visibility, direct-page route guards, API authorization, and UI action controls consistent. A read-only user must not edit, delete, approve, reject, reimburse, or configure records.
- Enforce permissions and tenant scope on the server; hiding a button is not authorization. Preserve employee self-service ownership rules.
- Include subfeatures such as designers, reports, configuration, approvals, and exports in the checklist. Label shared permission scopes accurately.
- Run `npm run test:permissions` and TypeScript checks before deployment. Extend the coverage tests for any intentional new access rules.
- Do not change existing companies' role grants merely to add checklist entries.

The user expects deployment after completed changes unless they explicitly request otherwise in the current task.
