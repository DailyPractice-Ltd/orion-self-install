# Release policy — when a version number is allowed to move

Written 23 September 2026, after seven versions shipped in seven days.

## What went wrong, stated plainly

Between 16 and 22 September this repo shipped 0.6.0, 0.6.1, 0.6.2, 0.6.3, 0.6.4,
0.6.5 and 0.6.6. Four of those landed on the same day, 19 September. None was
tagged, so none became a GitHub Release, even though this repo's changelog says
in its own header that every heading is a release with a tag behind it. The last
tag in the repo is `v0.5.7`, from 26 August.

More to the point: at the moment 0.6.6 shipped, **no harness anywhere was
running any 0.6.x version**, and the headline feature of the whole 0.6 line,
sending a skill back up to the library, had never once completed. We released
seven times into an empty room and then asked people to update.

That is what this policy exists to stop. Not the pace of the work. The pace of
the *asking*.

## The release train

**One release a month. The last Thursday.** Everything that is ready by then
goes out together, under one version number, with one note.

That is the only date a client is ever asked to move.

## The three gates

A version number is spent only when all three are true. Two out of three is not
a release, it is work in progress.

### 1. A named problem

The release closes a problem that is on the roadmap and that a client would
recognise from their own week. Written as the problem, not the change.

- Good: "you cannot send a skill you wrote back to us."
- Not a release on its own: "refactored the bridge auth path."

Internal correctness work rides along in a release. It does not cause one.

### 2. Evidence, on a machine that is not the one it was written on

Someone ran it, somewhere real, and the result is written down with a date.
Not a test suite passing. Tests are the floor, not the evidence.

For anything the client touches, the evidence is a number in the database that
moved, or a transcript of it working. "It should work" is not evidence. "It
worked here, on this date, and here is the row" is.

If the evidence does not exist, the work waits for the next train. There is
always another train.

### 3. A tag and notes a non-technical person can read

`git tag vX.Y.Z` on the shipping commit, pushed, which publishes the Release.
The notes say three things and nothing else:

- what was broken, in the client's words
- what changed
- what, if anything, they need to do

No version number moves without its tag on the same day. A changelog heading
with no tag behind it is a lie the changelog tells about itself.

## Between trains

Work merges to `main` as usual. Nothing stops.

- The version in `status/status.json` does **not** move.
- The changelog collects it under a single `## Unreleased` heading.
- **Nobody is asked to update.** Not a client, not an internal harness.

## The one exception

**A break-fix.** Something is broken right now for someone live. It ships the
day it is fixed, as a patch, still tagged, and the notes name what broke.

A break-fix is not "we found a better way". It is "this is broken for a person
today".

## The nag rule

The harness itself never tells anyone to update. It does not compare versions at
session start and it does not mention releases. Updating happens when a human
asks for it, in their own words, and never before. That is already how the
harness behaves and it stays that way.

We tell a client a train has left, once, by a message from a person. We tell
only the clients the train is actually for. A client with no exposure to the
problem the release closes does not get the message at all.

## How to tell if this is working

Three numbers, read at each train:

1. **Versions shipped this month.** Target: one. Two means a break-fix happened.
   Four means the policy is being ignored.
2. **Harnesses on the current version, thirty days after a train.** If this
   stays at zero, the release did not reach anyone and the next train's job is
   distribution, not features.
3. **Problems closed per version.** A release that closes no named roadmap
   problem should not have happened.
