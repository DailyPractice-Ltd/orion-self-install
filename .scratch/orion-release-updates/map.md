# Publishing future Orion updates

## Destination

An agreed release and update contract for Orion: how a version becomes publishable, how a client learns about it, and how their harness applies or recovers it. The result should be clear enough to implement without another product decision.

## Notes

- Planning only. The current updater is on `release/2.0.0`; the earlier update procedure is on `claude/exciting-bell-cb6662`. [Release proposal](https://github.com/DailyPractice-Ltd/orion-self-install/pull/41).
- Agreed before charting: `update my harness` targets the latest **published release tag**, not `main`; clients are notified and update on request; future new installs require the radio, while existing clients who declined check-ins keep that choice.
- The current release workflow publishes GitHub Releases from tags, but gets notes from `main`; the proposed 2.0 updater clones `main`. Both need to align with the agreed release identity.
- Use grilling and domain modeling while resolving decisions. Keep the meanings of *published release*, *release candidate*, *deployed harness*, *radio notice*, and *applied update* distinct.
- Local Markdown tracker convention: child tickets live in `issues/`; `Status: open` and no blockers means a frontier ticket.

## Decisions so far

- [What makes an Orion version publishable?](issues/01-release-promotion.md): An explicitly published GitHub Release ties fixed code and notes to a tested commit; major releases and migrations also receive a local trial.
- [Which exact release does a client apply?](issues/02-update-source.md): Select the highest stable published version, pin and verify its tag and commit, record the exact applied identity, and stop safely when source identity or availability fails.
- [How does a client hear about a release?](issues/03-release-notices.md): A paired harness hears once about its newest eligible release. New installs require radio; existing radio-off clients keep their choice but must opt in and pair before updating.
- [Which installed harnesses may take a release?](issues/04-compatibility.md): Releases declare supported starts and pinned migration paths. Unsupported clients receive a clean-install route; edits blocking required fixes stop the update for review.
- [What happens when a published update fails?](issues/05-failed-release.md): No client canary for now. Withdraw bad releases, tell affected paired clients, restore failed applications, and offer backup restore or a corrected release after successful application.

## Not yet specified

- No open product decisions in this map.

## Out of scope

- Implementing, tagging, or deploying a release during this planning effort.
- Changing an existing client's radio choice as a side effect of updating.
