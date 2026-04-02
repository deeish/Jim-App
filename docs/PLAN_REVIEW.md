# Plan review (pre-execution)

Use this document to draft work, align on scope, and **sign off before implementation**. Update it as the plan evolves; treat unchecked review items as blockers until addressed.

See **[INDEX.md](./INDEX.md)** for other project docs and where truth lives.

---

## 1. Summary

**Working title:**

**One sentence goal:**

**Owner / last updated:**

**Related docs / links** (issues, specs, `backend/docs/…`, PRs):

---

## 2. Problem & success criteria

**What problem are we solving?**

**How will we know it’s done?** (measurable or demonstrable)

- [ ] Criterion 1:
- [ ] Criterion 2:

**Out of scope** (explicitly not doing):

### Constraints

**Deadline (if any):**

**Must not break** (flows, contracts, users):

---

## 3. Approach

**Preferred approach** (high level):

**Alternatives considered** (and why we’re not choosing them yet):

**Dependencies** (APIs, data, other teams, env vars):

**Risks** | **Mitigation**

| Risk | Mitigation |
|------|------------|
| | |

---

## 4. Execution checklist

Break into ordered steps. Check off only after each step is verified.

| # | Step | Done |
|---|------|------|
| 1 | | [ ] |
| 2 | | [ ] |
| 3 | | [ ] |

**Files / areas likely to change** (for reviewers):

**Branch / PR** (fill in when work starts):

---

## 5. Review gate — must pass before coding

Complete this section before writing or merging implementation work.

- [ ] **Scope** is clear; out-of-scope items are listed and agreed.
- [ ] **Success criteria** are testable (manual steps or automated checks defined).
- [ ] **Test plan** exists: written steps, cases, or automated tests—enough that someone else could verify §2.
- [ ] **UX / copy** (if any) is agreed or explicitly deferred.
- [ ] **Data & migration** (if any): backward compatibility considered.
- [ ] **Rollback / feature flag** (if risky): noted or N/A.
- [ ] **Security & privacy** (auth, PII, keys): reviewed or N/A.
- [ ] **Performance** (extra calls, large payloads): acceptable or N/A.
- [ ] **Platform** (iOS/Android/web) and **accessibility**: considered or N/A.
- [ ] **Observability** (logging, metrics, alerts for failures): noted or N/A.
- [ ] **Documentation drift:** if behavior or APIs change, related docs (root `docs/`, `backend/docs/`, README, `.env.example`) are listed for update in §6.

**Reviewers** (optional): names or “self-review on date:”

**Approval to execute:** [ ] Yes — date: ______

**Phased approval (optional):** If work is split, approve only this phase here — scope: ______ — date: ______

---

## 6. Post-execution verification

Run after implementation.

**Branch / PR / commit:** (link)

- [ ] Success criteria from §2 verified.
- [ ] **Test plan** from §5 executed (manual and/or automated).
- [ ] No regressions in critical flows (list which you checked):
- [ ] Docs / env examples / **INDEX** pointers updated if behavior changed.

**Notes / follow-ups:**

---

## Appendix: definition of done (suggested)

Work is “done” when: code merged, §2 criteria met, §5 test plan satisfied, critical regressions checked, and docs/env/index updated when needed.

---

## Quick copy: new initiative

Duplicate §§1–5 into a dated file under **`docs/plans/YYYY-MM-DD-feature-name.md`**, or paste below. Keep this file as the reusable template.
