# Project instructions

- Apply the `better-ui` skill when changing or reviewing the interface. Preserve the existing visual style and check relevant UI states.
- Apply the `superpowers:systematic-debugging` skill for bugs: reproduce the failure, identify the root cause, add a failing regression test, then make the smallest fix and verify it.
- For frontend changes, verify rendering and interactions affected by the change; server tests and syntax checks alone are insufficient.

## Git operations

- On command failures or merge conflicts, explain the cause and propose a concrete fix instead of merely stopping. Use focused read-only checks and resolve clear, safe, reversible problems within the authorized scope.
- Preserve the intended behavior from both branches and unrelated local changes when resolving a merge. Ask only when the resolution requires a user decision or additional authorization.
- Keep push and merge requests focused on the requested Git operations. Run tests or inspect CI and deployment only when explicitly requested; keep reports short.
