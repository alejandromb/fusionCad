# Plans

Design documents for non-trivial features and tools. Each plan lives in its own file and gets referenced from `.claude/CLAUDE.md` when relevant.

## Why plans

Some work is finicky — touching it without a deliberate plan has a real chance of breaking what's already correct. The symbol pin-centering fix is a good example: the "bug" we thought we saw (asymmetric pin spacing 5-10-20) wasn't actually the only issue; the real bug was that the middle pin's data lagged behind its visual drawing by 2.5mm. A quick-fire fix would have missed this. A plan forces us to think through the state space first.

## When to write a plan

- The change touches a widely-used system (symbols, renderer, interaction hook, BOM)
- A wrong move would corrupt data or break existing correct behavior
- Multiple approaches are viable and we need to pick one
- The work spans more than one session

## When NOT to write a plan

- Routine bug fixes with clear root cause + fix
- One-file refactors
- New additive features that don't change existing contracts

## Format

1. **Problem** — what we're solving, why it matters
2. **Prior art / context** — what already exists, what we learned from past sessions
3. **Approach** — the design. Include rejected alternatives with reasons.
4. **Non-goals** — what this plan explicitly does NOT do (prevents scope creep)
5. **Safety rails** — what it MUST NOT break
6. **Test plan** — how we verify the change
7. **Rollout** — order of operations, commit boundaries

Plans are living documents: update them as we learn. Archive to `done/` when fully shipped.

## Current plans

- [Symbol audit script](./symbol-audit.md) — static analyzer for `builtin-symbols.json`
