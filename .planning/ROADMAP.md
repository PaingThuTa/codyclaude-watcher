# CodyWatcher Roadmap

**Created:** 2026-05-23
**Current Milestone:** v1.1 (in progress)
**Total Phases:** 5

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-05-23)
- 🚧 **v1.1 Voice Complete** — Phases 4-5 (in progress)
- 📋 **v2.0 Sound Notifications** — Phases 6+ (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-3) — SHIPPED 2026-05-23</summary>

- [x] Phase 1: Core Daemon & Hooks (2/2 plans) — completed 2026-05-23
- [x] Phase 2: Voice Recognition Integration (1/2 plans) — partial
- [x] Phase 3: Installation & Persistence (1/1 plans) — completed 2026-05-23

</details>

### 🚧 v1.1 Voice Complete (In Progress)

- [ ] Phase 4: Voice Loop Completion (2 plans)
- [ ] Phase 5: Security Hardening (1 plan)

### 📋 v2.0 Sound Notifications (Planned)

- [ ] Phase 6: Ringtone on Permission Requests
- [ ] Phase 7: Edit Request Alerts
- [ ] Phase 8: Claude Interrupt Notifications

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|-------------|--------|----------|
| 1. Core Daemon & Hooks | v1.0 | 2/2 | Complete | 2026-05-23 |
| 2. Voice Recognition | v1.0 | 1/2 | Partial | - |
| 3. Installation | v1.0 | 1/1 | Complete | 2026-05-23 |
| 4. Voice Loop | v1.1 | 0/2 | Not Started | - |
| 5. Security | v1.1 | 0/1 | Not Started | - |

---

## Phase Build Order Rationale

Phase 1 delivers the core plumbing (daemon + hooks) that can be tested without voice. The FIFO routing and HTTP endpoints are the foundation everything else depends on.

Phase 2 layers voice on top of the working plumbing. Once the daemon can write decisions to FIFOs, voice is just another input source for those decisions.

Phase 3 packages it all together. Building install on top of working code ensures the installer is tested against real behavior, not assumptions.