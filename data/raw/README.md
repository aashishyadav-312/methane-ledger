# Raw source files (read only)

Only `scripts/data/build_data.py` (Step 1) reads these files. Do not edit them; replace a file only with a newer version
and record it here.

| File | What | Source | Date |
|---|---|---|---|
| `CIL_Mine_Closure_Timeline_v5.xlsx` | Closure year for 311 Coal India mines: reserve on 31 Mar 2024 divided by output, with EC capacity checks. The main sheet is `Mine Closure Timeline` (rows 7 to 317). The `Method & Sources` sheet explains the method. | Built by Aashish from Lok Sabha Q.4259 reserves and the CIL production portal (read 11 Oct 2026) | Oct 2026 |
| `Mine_Wise_Extractable_Reserve_31.03.2024.xlsx` | Mine-wise extractable reserve, all companies | Ministry of Coal, Lok Sabha Unstarred Question 4259, Annexure I | 26 Mar 2025 |
| `LokSabha_AU4259_annexures.pdf` | Original reply annexures, including Annexure II (closed mines) | Lok Sabha | 26 Mar 2025 |
| `LokSabha_AU4259_annexures.txt` | `pdftotext -layout` output of the PDF, which the pipeline parses for Annexure II | Derived | Nov 2026 |

Notes:

- Closure years are reserve run-out at FY2025-26 output, not announced closure dates.
- Tikak Colliery (NEC) shows a reserve of 4,052 Mt, probably a typing error in the source, so its date is not
  meaningful.
- Mine positions are not in any source. The pipeline places mines at coalfield centroids, so they are approximate.
