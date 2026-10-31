# Security Policy

## Supported versions

Security fixes are made on the `main` branch. Tagged releases may receive a
patch when a vulnerability also affects the corresponding self-hosted build.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting for this repository and include:

- the affected version or commit;
- steps to reproduce the issue;
- the expected impact; and
- any suggested mitigation, if known.

The maintainers will acknowledge the report, investigate it, and coordinate
disclosure with the reporter. Please allow time for a fix to be prepared before
publishing details.

## App risk review

While an app awaits approval, nodes with only informational risks can execute.
Execution stops a branch when it reaches a node with unaccepted blocking risks.
Other branches continue, and safe nodes can execute independently even when
connected to a paused node. Risky widgets and direct execution entry points
remain gated. Approval resumes stopped chains at their blocked nodes without
rerunning completed nodes. The graph inspector's Risks tab remains available
for running apps and shows the required access score and capabilities.

Constant nodes and string concatenation can resolve request destinations
without executing graph code. Unknown connected inputs remain dynamic.
Sanitized static HTML references are informational; unsanitized HTML still
requires approval.

Source identity is session metadata supplied by the cloud loading path. Files,
gists, and serialized owner fields cannot grant a verified badge. A graph fetched
from the `publicUser` account receives the verified Tailrmade badge.
Public graph responses can supply TM account details outside the serialized
graph using `{ success: true, data: "...", owner: { name, email } }`. The backend
must obtain these fields from the owning account. Without that metadata the
frontend displays the cloud account ID. Private graph loads use the signed-in
TM account details.

The welcome risk regression loads `tests/frontend/cypress/fixtures/Welcome to
Tailrmade.ppgraph`, captured from the public welcome graph on 2026-10-17, and
asserts that there are no blocking risks. Keep this fixture synchronized with
the published welcome graph. The captured graph currently contains main-thread
code and dynamic destinations, so the check exposes those existing blockers.
