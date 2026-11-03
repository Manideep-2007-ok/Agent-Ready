# Security

## Reporting a problem

Please don't open a public issue for a security problem. Report it privately through this repository's **Security** tab (**Report a vulnerability**). If that option isn't available, contact one of the maintainers privately and we'll set up a private channel.

Include what you found, how to reproduce it, and what an attacker could do with it. We'll confirm receipt and keep you updated while we fix it.

## What we care about most

- **The TinyFish API key.** It must never reach the browser, logs, error messages or the repository. Screenshots are fetched through the server for this reason.
- **Paid runs started by someone else.** The server listens on `127.0.0.1` by default, refuses state-changing requests from other websites, rate-limits every endpoint that starts agents, and caps how many tests run at once.
- **Testing other people's sites.** Agents never log in, pay or place orders, and only visit public pages.
- **Input handling.** Web addresses, ids and tasks are validated on every endpoint.

## Supported versions

Only the latest `main` is supported while the project is pre-1.0.
