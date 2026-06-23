# AstrBot Yuzhu Desktop Pet Key Code

This repository is a curated export of the key implementation pieces from the local `AstrbotYuzhuDesktopPet` workspace.

Included:

- `apps/desktop-pet`
  - desktop pet frontend
  - Tauri shell
  - sprite manifest and selected sprite assets used by the current behavior
- `plugins/astrbot_plugin_desktop_pet_bridge`
  - AstrBot side WebSocket bridge
  - reply emotion routing
- `tools/prepare_local_runtime.ps1`
  - local runtime preparation script with external config and knowledge base overlay behavior
- `docs/reports`
  - selected work reports for Phase 4B and related bridge work

Excluded on purpose:

- runtime databases
- knowledge base data
- local secrets or tokens
- local logs
- generated build outputs
- machine-specific runtime snapshots

This export is intended for code review, backup, and GitHub publication of the critical implementation only.
