# Repository security

GitHub security features provide an additional layer of protection for this repository. They
complement the local validation and CI checks described in [Workspace and tooling](workspace.md).
Read this article when work affects dependencies, lockfiles, workflows, permissions, secrets,
security reports, Dependabot, CodeQL, or a security boundary in a published Directus extension.

## Dependabot

The repository has the dependency graph, Dependabot security alerts, and Dependabot security updates
enabled. Dependabot security updates may open pull requests when GitHub identifies a vulnerable
dependency and a compatible remediation is available. General dependency version updates remain a
separate concern.

Treat every Dependabot security alert as a finding that requires triage:

- patch genuine vulnerabilities as soon as practical;
- dismiss an alert only when it is a false positive or demonstrably non-exploitable, and record a
  clear reason in GitHub;
- do not dismiss alerts merely to keep the repository or pull request green; and
- require security-update pull requests to pass the normal CI, release package validation, and
  review process.

Keep the repository's package-manager and lockfile workflow intact when reviewing or updating a
Dependabot pull request. Use the pinned pnpm version and the frozen lockfile install documented in
[Workspace and tooling](workspace.md).

## CodeQL

CodeQL uses the repository-managed workflow at `.github/workflows/codeql.yml`. It analyzes
JavaScript/TypeScript and GitHub Actions workflows on pushes and pull requests targeting `main`,
merge-queue groups, weekly on Mondays, and manual dispatch. The shared configuration at
`.github/codeql/codeql-config.yml` excludes generated output, fixtures, tests, and documentation
from analysis.

Because this repository uses advanced setup, GitHub CodeQL default setup must be disabled in the
repository's Settings → Code security → Code scanning configuration. Do not enable both setups:
GitHub's default setup can disable a custom workflow and block its uploads, and multiple active
configurations can create duplicate or stale results. Existing code-scanning alerts remain available
for triage after switching configurations.

The workflow grants only read access to repository and Actions metadata plus
`security-events: write` for SARIF result uploads. Findings are available in GitHub code scanning
and should be triaged rather than suppressed solely to make a check pass.

CodeQL is a security analysis check, not a replacement for formatting, linting, type checking,
tests, extension builds, or package validation. Keep those checks in the normal CI workflow.

When a finding concerns generated extension output, fixtures, or another deliberately excluded path,
document and review that exclusion carefully. Do not exclude extension source code simply to silence
a legitimate finding.

## GitHub Actions security

Actions workflows should use the minimum permissions needed for each job. GitHub-maintained and
third-party actions must be pinned to full immutable commit SHAs, retaining the corresponding
release or tag in an inline comment. Avoid adding broad write permissions unrelated to the job's
purpose.

## Reporting

Report suspected vulnerabilities through the repository's configured GitHub security reporting
channel rather than opening a public issue with sensitive details.
