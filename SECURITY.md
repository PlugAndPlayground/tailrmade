# Security Policy

## Supported versions

Security fixes are made on the `main` branch. Tagged releases may receive a
patch when a vulnerability also affects the corresponding self-hosted build.

## Threat model

A tailrmade app is code, and opening one runs it. An app can run JavaScript
(Custom function, Map, Filter, Reduce and similar nodes), load npm packages,
render HTML with scripts, send requests with your stored API keys, use the
Companion, read and write storage, call AI models and run on intervals. Anyone
can build an app and share it as a link, a file or a public cloud app.

### Where an app comes from

Every app records where it came from. This is never read from the app file.

- **Local**: created in this browser. Apps saved before this was recorded also
  count as local, because imported and self-made apps were stored the same way.
- **Your cloud**: fetched from your own cloud account.
- **Imported**: everything else, including content links, dropped files, other
  people's public apps and the get-started app. Saving, copying or uploading an
  imported app keeps it imported.

### What is contained

- Imported apps open paused. Nothing in them runs until you choose Run, and
  what they can do is listed first. Code, API keys, storage and the Companion
  stay off unless you tick them. Connections, AI and intervals are on unless
  you untick them. Addresses an app puts together while running stay blocked.
  Your choice is remembered for that app in this browser until what it can do
  changes.
- Links can't change code. The `setSocketData` link parameter refuses code and
  HTML inputs and the settings that decide what an app runs or where it sends
  data: Main Thread, Sanitize input, Send Through Companion, Headers, URL, Body,
  Package Name and Location. Other changes are listed first and only applied
  when you choose Open.
- Each capability is checked where it is used. Code nodes are checked before
  they run, and HTML is sanitised without full access. HTTP requests check the
  Companion, API keys and host just before they are sent, so hosts and keys
  built at runtime are caught. WebSocket and SQLite URLs check the host,
  storage nodes check the backend and location, and AI nodes and intervals
  check their own grant.

### What is not contained

- Full access is all or nothing. Code runs in the tailrmade page's origin, and
  the Web Worker is not a boundary, so code an app runs can reach your session
  and local data. Running code in a separate origin is planned.
- Data can still leave through URLs that aren't requests: images in sanitised
  HTML, nodes that load images or video from a URL, and links opened in a new
  tab.
- Nodes pasted from the clipboard run straight away in the app you paste them
  into.
- The local Companion substitutes `$TM_KEY` values without checking a key's
  domain and can reach loopback and private network addresses. Keys sent
  through the Cloud Companion rely on the key grant until the backend checks
  each key's domain. Turning the Companion off for an app is the protection.
- The HTTP node's default header placeholder,
  `$TM_KEY{YOUR_ENVIRONMENTAL_COMPANION_VARIABLE_HERE}`, is not treated as a key.

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
