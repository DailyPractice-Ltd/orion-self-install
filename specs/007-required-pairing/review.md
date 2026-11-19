# Required pairing final review

Reviewed the integrated candidate once along two independent axes, then applied
one fix pass. Review points:

- Self: `git diff b2f785b74ce7d796283886886c8b6f315afedb2b...98d683218c40f36d91e5271fa516522b4b662797`.
- Mono: `git diff c18fe4d3769aa3dc37b0794852b34197d5d2dc4b...b4ebd5b0f0408775bcb4f3701f85fde1f43c682e`.

## Standards

One documented-standard violation was found:

- **P2: preserve concurrent pairing and checkpoint writes.** At the review point,
  `start.mjs` lines 249–253 copied only `sharing.pairing` from current status before
  writing a stale wizard snapshot. A wizard waiting for a surface answer could
  overwrite another wizard's newly saved credential/identity and delete its
  checkpoint. This violated constitution Article II's resumability guarantee and
  the shared-lock persistence/concurrency contract. Saves now apply only intended
  changes to fresh state and adopt the resulting current state.

No additional actionable documented-standard violation was found in the mono
diff, and no baseline smell finding warranted a separate change.

## Spec

Two implementation findings were found:

- **P2: preserve migration eligibility when reporting runs first.** At the review
  point, `status/report.mjs` lines 170–179 introduced a pairing marker on report
  failure without starting legacy migration. A later guard then treated the old
  harness as marked and denied its transition. The spec requires a one-time
  30-day clock on the first updated run. Reporting and the guard now share the
  migration policy in `status/store.mjs`, with durable timestamps before the marker
  can remove eligibility.
- **P2: remove the remaining website-only recommendation.** At the review point,
  `start.mjs` lines 430–433 still said websites worked for everyone when no apps
  were detected. The spec explicitly removes that supported path. This branch
  now directs users to Codex or Claude Code.

No scope creep or additional concrete server ownership, redemption transaction,
verification-side-effect or acknowledgment defect was identified. Database
integration execution and the live journey remain incomplete verification, as
explicitly deferred; they are not claimed to have passed.

## Resolution and focused verification

All three findings were addressed in source commit `398beb5`, integrated with
final fix/evidence/fingerprint tip `4bbbc50a85ac66ba310b9116b47494384e18c4ab`.
Public CLI/report regressions went red before the changes and green afterward.
The final full client suite passed **297 tests**, with zero failures, skips or
cancellations. Both Codex and Claude Code package plans passed, and regenerating
the pristine registry after the final evidence commit produced no change.
The mono implementation is unchanged from its previously passed build, lint,
typecheck, 360-test suite and Next compile checks.

Standards: 1 P2 found, resolved. Spec: 2 P2 found, resolved. No second broad review
was run; the fix pass used focused regressions and the required affected checks.
See [verification](verification.md) for the open database/live checklist. Ticket
07 remains incomplete until those checks pass; no release was published or deployed.
