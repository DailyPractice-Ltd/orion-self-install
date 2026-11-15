# Orion release language

Terms shared by Orion's release publisher and deployed harnesses.

## Language

**Release candidate**:
The exact proposed version of Orion that is being checked before publication.
_Avoid_: Latest `main`

**Published release**:
A version of Orion that a maintainer has made available to clients through a GitHub Release tied to a fixed version tag.
_Avoid_: Tag alone, commit on `main`

**Latest published release**:
The published stable Orion release with the highest version number.
_Avoid_: Latest commit on `main`, most recently published release

**Withdrawn release**:
A previously published Orion release removed from update eligibility because it must no longer be installed.
_Avoid_: Deleted tag, rewritten release

**Applied update**:
A published release whose files and required migrations have been installed successfully into a deployed harness, with its exact release identity recorded in that harness's status.
_Avoid_: Update available, downloaded release, attempted update

**Radio notice**:
A structured announcement from Daily Practice about a published Orion release, shown to a connected harness without starting an update or asking for a reply.
_Avoid_: Personal message, update command

**Deployed harness**:
A client's own Orion folder containing that client's agent, status, knowledge, and selected tool layout.
_Avoid_: Release repository, temporary release checkout
