# Project Workflow

## Local-first review gate

- Implement requested changes in local project files first.
- Run relevant tests, type checks, builds, packaging, privacy scans, and local installation checks as needed.
- Present the completed local diff, verification results, and generated artifacts to the user for review.
- Do not stage or commit Git changes until the user explicitly approves the reviewed local changes.
- Do not push branches, update `main`, create tags, publish GitHub releases, upload release assets, or otherwise modify GitHub until the user explicitly requests that publication after review.
- A request to "update", "finish", "build", or "prepare a release" does not by itself authorize Git or GitHub publication.
- An explicit instruction in the current conversation can override this gate for that specific task.
