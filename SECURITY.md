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

A connected input counts as resolved only once the socket holds the value the
review worked out. A source that has not delivered it leaves the input dynamic.
Output socket data is never read from a graph file.

Sanitized HTML has no forms. In the HTML node it also has no stylesheets and is
painted inside its own box; Slides keeps stylesheets but scopes them to the
deck, and the IFrame nodes keep them inside the frame. The review reads
addresses from the parsed, sanitized markup, the same markup that is rendered.

Draw image, Draw shader and the image socket preview load an address on another
site only when it is fixed on the node, where the review lists it. An address
that arrives while the app runs is refused; an Image node loads it instead and
is reviewed for it. Draw image takes image data or an address as text and
refuses anything else.

The HTML and IFrame nodes are reviewed on the markup they render: the template
is expanded with its data and its own partials first. A template that calls a
macro cannot be expanded without running the app and is reported as dynamic.
Partials belong to the node they are connected to and are not shared between
nodes.

Input values carried by a link (`setSocketData`) are applied while the app
loads, before any node runs and before the review reads the app. They are part
of what an approval is tied to, so an approved app opened with other values is
reviewed again. That holds for inputs that only exist since a migration too.

Theme strings and custom styles are limited to plain CSS values. Custom styles
keep properties, `@media`/`@container`/`@supports` blocks, states of the
element itself (`&:hover`) and selectors for elements inside it (`& img`,
`& > .row`). Images may be embedded data or a path on Tailrmade's own site
(`/assets/…`). Selectors that reach outside the element, addresses on other
sites and any `position` other than `static`, `relative`, `absolute` or
`sticky` are dropped. Pasted text becomes an Embed website
node only when it is an `http(s)` address, which is written out escaped.

Approval is remembered when a person runs the app, or saves an app that is
already running. Saving an app that is still paused does not approve it.

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
