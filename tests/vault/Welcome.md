# Sandbox vault

This vault exists so the in-app test suite has somewhere safe to run.

Open it in Obsidian, enable **Import Attachments+** (point the plugin folder at the
repository's `dist/`), then run the command **Run plugin tests**.

Each test creates and deletes its own folder under `_plugin-tests/`, so this vault
should look exactly the same before and after a run. If `_plugin-tests/` is still here
afterwards, a test crashed hard enough to skip its cleanup — delete it by hand.
