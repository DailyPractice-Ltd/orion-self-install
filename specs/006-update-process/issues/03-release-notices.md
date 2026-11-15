# How does a client hear about a release?

Type: grilling
Status: resolved

## Question

Define when Daily Practice sends a release notice over the radio, what it says, how often it may recur, and how Orion presents it without applying the update. Cover required radio on new installs and existing harnesses that previously declined check-ins.

## Decisions so far

- A release notice is a distinct, structured radio item carrying the version and release identity. Orion presents it as an announcement; it expects no reply and starts no update.
- Send a notice only to a paired harness with check-ins on when its installed version is older than the newest published release it is eligible to take (compatibility is issue 04). If several releases were missed, notice only the newest eligible one.
- Present the version, a short plain-language summary drawn from the changelog at the published commit, a link to full release notes, and the phrase "Say 'update my harness' when you're ready." Keep the commit hash and GitHub Release ID in the structured payload, out of the spoken message.
- Show a release notice once per harness and release. Retry delivery only until Orion durably records that it was shown; no periodic reminders for an ignored notice. A later release can generate a new notice.
- Future new installs must pair and confirm a working radio before installation is marked complete; if pairing is unavailable, the install pauses and resumes later. Existing harnesses that declined check-ins retain that choice and receive no radio notices. They cannot update until the client voluntarily turns on and pairs the radio.
- When a radio-off client requests an update, explain the pairing requirement and offer to turn on and pair the radio. Do not change the harness until they agree and pairing succeeds; then continue the update already requested.

## Answer

After a stable GitHub Release is published, Daily Practice may issue a structured radio notice to each paired harness with check-ins on whose installed version is older than the newest published release that harness can take. Compatibility is defined in issue 04. If several versions were missed, only the newest eligible release is announced. A radio notice is distinct from a personal message: it carries the version and exact release identity, expects no reply, and never starts an update.

Orion shows the version, a short plain-language summary from the changelog at the published commit, a link to the full release notes, and "Say 'update my harness' when you're ready." The commit hash and GitHub Release ID stay in the structured payload rather than the client-facing message. The notice is shown once per harness and release. Delivery retries only until Orion durably records that the notice was shown; ignoring it causes no reminders. A later eligible release may cause a new notice. Withdrawal and correction notices belong to issue 05.

Future new installs must pair and confirm a working radio before installation is marked complete. A temporary pairing failure pauses the install for later resumption. Existing clients who declined check-ins keep that choice and receive no radio notice. They cannot update while the radio is off. If they request an update, Orion explains the pairing requirement and offers to turn on and pair the radio; the harness remains untouched until they agree and pairing succeeds, after which Orion continues the update they already requested.

