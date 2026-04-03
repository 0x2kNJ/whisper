# ADR-002: Milestone-Based Escrow Over Token Streaming

## Status
Accepted

## Context
Whisper enables programmable payroll on Arc testnet. The system must support recurring payments with conditions (e.g., quarterly bonuses, performance-based releases) while fitting how real organizations actually distribute funds.

Two patterns emerged as candidates: continuous token streaming (Sablier-style) and discrete milestone-based releases. The choice affects how payroll feels to employees and what conditions can be enforced.

## Decision
Implement multi-milestone escrow with independent time and oracle conditions for each release. Each milestone represents a discrete payment event (e.g., "Q1 salary", "performance bonus", "vesting tranche") rather than continuous streaming.

Reasons:
- Milestones map naturally to real payroll cycles (monthly, quarterly, bonus periods)
- Each milestone is independently verifiable (clear success/failure states)
- Aligns with how companies actually pay (discrete events, not continuous streams)
- Easier to integrate oracle conditions (performance metrics, oracle attestations)
- Clear accounting: each milestone is a discrete transaction for bookkeeping

## Alternatives Considered

**Token Streaming / Sablier Model (Rejected)**
- Pros: Continuous per-second accrual; more granular; psychological appeal of "watching balance grow"
- Cons: Doesn't match real payroll (companies don't pay continuously); harder to attach conditions to arbitrary time windows; harder to understand ("did I earn this yet?"); more gas-intensive per release

**Simple Time-Based Unlocks (Rejected)**
- Pros: Minimal implementation
- Cons: No flexibility for conditions; doesn't support performance triggers or oracle-based releases; too rigid for real use cases

## Consequences

**Positive:**
- Each milestone is a clear, verifiable event
- Natural fit with real payroll timelines
- Easy to attach oracle conditions (pass/fail per milestone)
- Employees know exactly when each payment should arrive
- Simple to audit and reconcile in accounting systems
- Works well with stablecoin payments (USDC on Arc)

**Negative:**
- Lack of continuous accrual (some prefer watching balance grow)
- Higher perceived latency between work and payment (vs. per-second streaming)
- Requires upfront definition of milestones (less flexible than continuous streaming)
- Multiple transactions instead of one continuous release

**Implementation Notes:**
- WhisperEscrow stores milestone array with timestamps and conditions
- Each milestone is independently releasable
- Oracle conditions checked at release time (not continuously monitored)
- Future: Add streaming mode within milestones if needed (e.g., stream within Q1, then release at quarter-end)
