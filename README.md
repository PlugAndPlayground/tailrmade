# Tailrmade

Tailrmade is an open-source visual web app builder/programming canvas that runs in your browser.
Create interactive applications, transform and visualize data, work with AI and move between
visual editing and code.

The hosted product is available at [tailrmade.app](https://tailrmade.app). This repository contains the application itself and a
small static server for self-hosting.

## Develop

You need Node.js 18 or newer and Corepack-enabled Yarn.

```sh
corepack enable
yarn install
yarn dev
```

The development server is available at <http://localhost:8080> and uses local,
browser-only storage. It does not require Firebase or the private backend.

Useful commands:

- `yarn build` creates a self-hosted production bundle in `dist/`.
- `yarn start` serves an existing production bundle on port 8080.
- `yarn test:jest` runs frontend unit tests.
- `yarn test:e2e` runs frontend Cypress tests against a temporary local server.
- `yarn test` runs every frontend-owned test.
- `yarn code-style-check` runs lint and formatting checks.

To self-host with Docker:

```sh
docker build -t tailrmade .
docker run --rm -p 8080:8080 tailrmade
```

## Contribute

Contributions are welcome. Fork this repository, create a branch, and open a
pull request. CI runs the build, code-quality checks, unit tests, and browser
tests. No backend credentials or Firebase emulators are needed.

Cloud integration is maintained in the private deployment repository. That
repository consumes this project as a complete source checkout and owns all
backend- and Firebase-dependent tests.

## License

Source code is licensed under the GNU Affero General Public License v3.0 or
later. See [LICENSE](LICENSE). The Tailrmade name and branding are not licensed
under the AGPL; see [TRADEMARKS.md](TRADEMARKS.md).
