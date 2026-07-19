# Tailrmade documentation

This directory contains the Tailrmade documentation website, built with
[Docusaurus](https://docusaurus.io/).

Run documentation commands from the repository root:

```sh
yarn dev:docs
yarn build:docs
```

`yarn build:docs` builds this site and copies it into `dist/help`, where the
self-hosted server and the private backend can serve it alongside the frontend.
The public repository does not deploy the documentation or application.
