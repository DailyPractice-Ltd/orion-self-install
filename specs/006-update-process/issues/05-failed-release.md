# What happens when a published update fails?

Type: grilling
Status: resolved

## Question

Decide how to stop further installs of a bad release, notify affected clients, and recover a harness that failed during or after application. Determine whether staged rollout or a canary is needed before broad notification.

## Decisions so far

- No client canary for now. After the release gates in issue 01 pass, notify all eligible paired harnesses; use withdrawal and recovery if a defect escapes.
- Mark a bad GitHub Release withdrawn so it is excluded from discovery and fails the prewrite recheck. Keep its tag and commit immutable for audit; publish corrections under a new version.
- Send a distinct withdrawal notice to paired harnesses that were notified of or applied the release. Say whether this harness applied it and name the next safe action. Deliver at the next radio check; never automatically roll back.
- An already-applied bad release offers the client a choice to restore the pre-update backup or wait for a corrected new release. No automatic rollback. Restore protects later client work and restores the prior recorded release identity.
- Run required local post-apply smoke checks before recording a release as applied. If one fails, automatically restore the pre-update state, retain the failure report, and leave the prior release identity in status.
- If automatic restoration fails, stop further update attempts, preserve backup and recovery journal, identify affected files, and use recovery from a separate pinned source rather than trusting the installed updater.
- A corrected release must declare a supported migration path from the withdrawn version. If it cannot, Orion offers restoration to the pre-update backup before updating.

## Answer

Orion has no client canary for now. A release is offered to all eligible paired harnesses after the publication gates in issue 01 pass. If a published release proves bad, Daily Practice marks its GitHub Release withdrawn immediately. Orion excludes it from discovery and its prewrite recheck refuses it; the tag and commit remain fixed for audit. A correction receives a new version.

Daily Practice sends a distinct withdrawal radio notice to paired harnesses that received the release notice or recorded the release as applied. Orion shows whether this harness applied the withdrawn release and the next safe action, at the next radio check. The notice itself never rolls back or updates the harness. A harness that already applied the release can choose to restore its pre-update backup or wait for a corrected version. Restoration protects client work done after the update and returns the recorded release identity to the prior one.

An update is not recorded as applied until required local post-apply smoke checks pass. If a check fails during application, Orion automatically restores the pre-update state, retains a failure report, and leaves the prior release identity in status. If restoration itself fails, Orion stops further update attempts, preserves the backup and recovery journal, identifies affected files, and uses a recovery command from a separate pinned source rather than the possibly damaged installed updater.

A corrected release declares a supported migration path from the withdrawn version. If it cannot support that starting state, Orion offers restoration to the pre-update backup before updating, subject to the compatibility rules in issue 04.

