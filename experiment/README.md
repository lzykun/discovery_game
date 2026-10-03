# Discovery game aggregated chain

This PsyNet experiment adapts the public `discovery-chains` JavaScript crystal game into an aggregated transmission-chain design. The compact local configuration is one chain, the `easy` rule family, two participant trials per generation, and three participant-facing generations. The same `RUN_CONFIGS` object in `experiment.py` contains the full 20-chain, three-condition, 20-participant-per-generation specification.

The implementation stores aggregation audit data in PsyNet node variables and trial answers; it does not use custom SQL tables or the original PHP save endpoint.
