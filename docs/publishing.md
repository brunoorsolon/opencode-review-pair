# Package publication

Package name: `@matuto-ai/opencode-broker-connector`. The npm workflow follows the owner's existing release-triggered trusted-publishing pattern, with version verification, full native tests and package audit before publication.

1. Review and merge the feature PR.
2. Bootstrap the package under an npm account authorized for this package if it does not exist yet. Account creation, credentials and first publication are operator actions, not performed by the connector.
3. Configure npm's GitHub Actions trusted publisher for owner `matuto-ai`, repository `opencode-broker-connector`, workflow `npm-publish.yml`. If the repository moves, update package metadata and trusted-publisher settings together.
4. Create a GitHub release whose tag exactly matches `v` + package.json version (next `v0.4.0`).
5. The action runs syntax, tests including pinned actual CLI, package inspection, then `npm publish --access public --provenance` using OIDC. No long-lived npm token is stored in the workflow.
6. Confirm npm has the exact version before recommending npm installation. Failed publishing is not repaired by silently changing a version or recreating a tag.

`id-token: write` is limited to the release workflow. This repository does not configure a trusted publisher, generate credentials, publish, merge or deploy automatically on ordinary pushes/PRs. Those events run read-only CI checks only.

Before npm publication, the local-file installation in README works directly from `main` after the release PR is reviewed and merged. No unpublished dependency is required.

## Minor release

This PR prepares `0.4.0`; the intended GitHub release tag is `v0.4.0`.
After review and merge, the maintainer can publish that release from the merged
commit to exercise npm Trusted Publishing. This code change does not itself
create a tag, release, or npm publication. Verify the workflow succeeds and the
scoped npm version exists before recommending it for installation.

Existing `0.1.x` npm packages and old GitHub tags remain untouched. Do not reuse
or move an old release tag; the new tag must exactly match the package version.
