## DevClaw Methodology Compliance

**Project**: @opensourceclaw/claw-ctx
**Protocol Version**: v2.7
**Onboarded**: 2026-07-17

---

### Agent Roles

| Role | Name | Responsibilities |
|------|------|------------------|
| A | Friday | Project/Product management, Release |
| B | Jarvis | Implementation, Unit/Integration tests |
| C | Edith | Independent QC, System tests |

### Process Checklist

Every feature follows the DevClaw pipeline:

- [ ] **DESIGN Stage**
  - [ ] Summary Design → `inbox/inbox-code/`
  - [ ] Detailed Design → `inbox/inbox-code/`
  - [ ] Design Review → `inbox/inbox-design-review/`

- [ ] **BUILD Stage**
  - [ ] Implementation → `inbox/inbox-code/`
  - [ ] Code Review → `inbox/inbox-code-review/`
  - [ ] Internal Verify → `inbox/inbox-internal-verify/`

- [ ] **TEST Stage**
  - [ ] Test Suite → `inbox/inbox-test/`

- [ ] **RELEASE Stage**
  - [ ] Release → `inbox/inbox-deploy/`

### Quality Gates

| Gate | Stage | Rules |
|------|-------|-------|
| DesignReviewGate | DESIGN | 3 failed + 3 warning |
| CodeReviewGate | BUILD | 3 failed + 3 warning |
| InternalVerifyGate | BUILD | 6 failed + 3 warning |
| CIGate | BUILD | 3 failed + 3 warning |

---

*DevClaw Methodology — v2.7*
