# Crash-after-effect demonstration

The simulator accepts operation `op-002`, records one synthetic effect, and then deterministically loses its acknowledgement. The workflow result is `COMPLETION_UNKNOWN`, not success and not an invitation to retry blindly. The recorded receipt binds the logical operation, operation digest, acknowledgement state, effect count, and synthetic adapter/version.

Recovery queries the operation-ID ledger before any redispatch. It finds the existing effect, records reconciliation, reads back the simulator state, and emits `VERIFIED_MATCH` because the observed setpoint matches the intended setpoint. The assertion is deliberately narrow: duplicate-effect containment for this deterministic reference simulator under its implemented operation-ID semantics, not a claim of universal exactly-once execution.
