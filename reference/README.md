# Reference model (source of truth)

- `cmm_model.py` is the reference model from the build spec appendix. Do not edit it.
- `ref_v1.py` extends it without changing it: IRR, closure-year cases, price escalation, financing structures A to E,
  the waterfall and the tornado. Running `python3 reference/ref_v1.py` writes `tests/golden/*.json` and prints a
  summary. It uses the standard library only.
- `npm run golden:check` reruns it and fails if the committed goldens differ.

All values are DUMMY placeholders until CMPDI data arrives. Step 12 adds a real-data golden set alongside, not instead.
