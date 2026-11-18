# 01: Self-service pairing and verification

**What to build:** A signed-in Daily Practice user can obtain or renew a short, expiring, single-use code for their account. Their Orion folder can exchange that code for its server-derived identity and verify the resulting credential without consuming support messages. Pairing links an account; it does not check payment or subscription status.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Confirm the current server's code issuance, exchange, authentication, account ownership, and event replay contracts before changing the client; record the findings with the feature.
- [ ] Provide a signed-in page that issues a code, shows its expiry, and offers renewal without support intervention. Enforce account ownership on the server, including accounts without an existing harness.
- [ ] Preserve the existing short-code format, single-use exchange, and server-derived harness identity unless current server evidence requires a documented change.
- [ ] Provide an authenticated, side-effect-free verification route. Do not consume messages, mark them read, update activity, or count work merely by verifying.
- [ ] Distinguish accepted credentials, invalid or revoked credentials, and server errors; do not misclassify a database failure as invalid credentials. Document network failure handling for callers.
- [ ] Never show an install token in the page, logs, or error output, or ask a user to paste one. Return it only through the existing credential exchange.
- [ ] Test authentication and account isolation, expiry, renewal, malformed/expired/reused codes, concurrent redemption, successful verification, revoked credentials, and server failure.
- [ ] Update the monorepo bridge contracts alongside server changes. Make all monorepo changes on `feature/required-pairing`.
