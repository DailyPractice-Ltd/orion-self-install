# Finishing setup

Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.

Open [your pairing page](https://www.dailypractice.world/home/pair), sign in, and issue a code. In your installed Orion folder run:

```sh
node start.mjs --code <your-code>
```

The code lasts 15 minutes and works once. The wizard saves your answers and the exchanged credential before checking that Daily Practice accepts this folder's connection. Setup finishes and prints the next prompt only after fresh verification. Old decline or skip flags cannot finish a new setup.

If setup stops, run `node start.mjs` again. A saved credential is checked again without spending another code or asking your saved answers again. Missing, expired, used, or malformed codes need a new code from the pairing page. If the connection fails during exchange and no credential was saved, renew the code: the server might have used it before the reply arrived. If verification fails after exchange, restore the connection and rerun the wizard; the credential stays saved.

A folder with a home saves the key only in machine-local `status/radio.key`; ordinary folders save it in `status/status.json`. Never paste either credential into chat. An interrupted process can leave the shared status lock: inspect `status/.radio-lock/owner.json` and establish that its PID on its named host has stopped before removing only that lock directory. Never remove an active or unknown owner’s lock or replace the saved status or report files.

For direct conversational installation, use the explanation above verbatim and the same pairing page and wizard command. When scripts cannot run in the conversation, have the person run the command in their installed folder. An exchange reply, a stored pairing date, a plausible key, or a cloud environment alone does not establish successful setup. Do not start day-to-day work or hand off until the wizard reports verified success. Existing-user transition reminders permit their temporary work window; they do not certify a new setup as finished.
