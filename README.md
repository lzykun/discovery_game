# Discovery game PsyNet package

This bundle contains the PsyNet implementation of the aggregated JavaScript discovery-game transmission-chain experiment, plus analysis/export tooling and example exported data.

## Structure

```text
experiment/
  PsyNet experiment code. Run commands from this directory.
  experiment.py                  # PsyNet Experiment, ChainNode/Trial logic, aggregation
  config.txt                     # local/debug PsyNet/Dallinger configuration
  requirements.txt               # PsyNet dependency pin
  constraints.txt                # generated Dallinger/PsyNet constraints
  static/discovery-chains/       # vendored upstream discovery-chains HTML/JS/CSS/images
  templates/                     # PsyNet templates generated from upstream task-base/task-after HTML
  scripts/export_and_analyze.py  # export + analysis script
  tests/participant-flow.spec.js # Playwright participant evidence flow

analysis/
  analysis.ipynb                 # executed notebook checking simulated export and aggregation
  export_analysis_demo.ipynb     # executed notebook demonstrating scripts/export_and_analyze.py
  derived_csv/                   # example normalized CSV outputs

example_export/
  simulated_data.zip             # example PsyNet simulated export from three complete compact generations
  aggregation_inspection.txt     # concise inspection of generation/message aggregation
  performance.json               # local performance-test JSON evidence
```

## Running the experiment locally

From `experiment/` with a prepared PsyNet environment:

```bash
source ~/PsyNet/.venv/bin/activate
python experiment.py
psynet test local
psynet debug local
```

The compact configuration runs one chain, one condition (`easy`), three generations, and two participant trials per generation. To switch to the full parameter set, edit `ACTIVE_CONFIG_NAME` in `experiment.py` from `"compact"` to `"full"`.

## Exporting and analyzing data

Analyze an existing export:

```bash
python scripts/export_and_analyze.py   --export-path ../example_export/simulated_data.zip   --output-dir ../analysis/derived_csv
```

Export a running local PsyNet experiment, then analyze it:

```bash
python scripts/export_and_analyze.py   --run-local-export   --local-export-dir data/manual_export   --output-dir ../analysis/manual_derived_csv
```

The script writes:

- `subject_data.csv`
- `action_data.csv`
- `event_data.csv`
- `notebook_data.csv`

Free-text fields are sanitized to remove parser-hostile special characters while preserving substantive content.

## Notes

- The upstream `discovery-chains` repository did not include a top-level license file at the referenced commit; attribution is preserved in `experiment/static/discovery-chains/SOURCE.md`.
- The example export is deterministic bot evidence for workflow/data-path review, not human behavioral evidence.
- Do not use production recruitment credentials with this package.
