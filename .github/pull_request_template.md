## What & why

<!-- Briefly: what does this change and why. Link any related discussion. -->

## How it was verified

<!-- Tests added/updated, manual steps run (`npm run dev`), screenshots if UI. -->

## Docs updated (required)

Confirm every doc affected by this change is current in the same PR:

- [ ] `README.md` — if setup, commands, or features changed
- [ ] `docs/PLAN.md` — if architecture, milestones, or mechanics changed
- [ ] `docs/DATA-SOURCING.md` — if the data pipeline / schema changed
- [ ] `docs/QUESTIONS-FOR-ALEX.md` — resolved questions removed/answered
- [ ] Code comments / `.env.example` — if config or contracts changed
- [ ] N/A — this change touches no documented behavior

## Checklist

- [ ] **TDD**: tests were written first (red → green) for any behavior change
      — or N/A (pure data/docs)
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass locally
- [ ] No secrets committed (tokens go in `.env.local`)
- [ ] Branch will be deleted on merge
