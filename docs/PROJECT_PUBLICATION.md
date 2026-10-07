# Project publication and recovery

Native project saves use a validated, fsynced file with a unique sibling name.
An existing project is copied into a unique backup staging file, fsynced and
atomically renamed to `.bak` before publishing the new project by rename.
Validation never touches an existing project or backup. Saves to the same
Windows destination serialize, and a failed save does not prevent later saves.
Autosave uses the same publication queue without a backup. The renderer owns
dirty-state decisions using its revision counter, so a native save cannot clear
a newer edit. Unrelated `<name>.pending` files are preserved.

Nine storage tests pass: validation errors, copy/rename failure, simultaneous
saves, and actual child-process termination after complete staging, backup
publication and final publication. Those interruption fixtures independently
read either the previous or next complete JSON document. Normal failures clean
up owned temporary files. A killed process can leave its uniquely named staging
file; it never requires overwriting an unrelated file to recover.

This establishes process-interruption behavior on the current Windows machine.
Power-loss durability, clean-machine qualification and the full document-state
migration/replay domains remain separate release requirements.
