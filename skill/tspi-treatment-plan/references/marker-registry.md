# TSPI marker registry (engine dataset tspi_marker_registry v0.2.0)

Generated from `tspi_new/apps/ai-engine/data/marker_registry.json`. Regenerate when the engine registry changes.

Use the **Analyte name** column (or an alias) exactly when submitting labs. Names are matched case-insensitively, ignoring spaces and punctuation. A lab not in this table is still sent, but the engine can only label it `lab:<name>` (no axis interpretation).

| Analyte name | Accepted aliases | Unit | Direction rule | Primary axis |
| --- | --- | --- | --- | --- |
| CRP | c-reactive protein, hscrp, hs-crp | mg/L | LOWER_BETTER | A1 |
| ESR | sed rate | mm/hr | LOWER_BETTER | A1 |
| HbA1c | a1c, glycated hemoglobin | % | LOWER_BETTER | A5 |
| Glucose | fasting glucose, fastingglucose, fbg | mg/dL | LOWER_BETTER | A5 |
| Hemoglobin | hb, hgb | g/dL | HIGHER_BETTER | A26 |
| MCV | mean corpuscular volume | fL | TARGET_RANGE | A26 |
| TSH | thyroid stimulating hormone | mIU/L | TARGET_RANGE | A33 |
| Sodium | na | mmol/L | TARGET_RANGE | A34 |
| Potassium | k | mmol/L | TARGET_RANGE | A34 |
| Vitamin D | 25-oh vitamin d, vitamind, 25ohd | ng/mL | HIGHER_BETTER | A15 |
| IgE | immunoglobulin e | IU/mL | LOWER_BETTER | A2 |
| Ferritin | serum ferritin | ng/mL | CONTEXT_DEPENDENT | A26 |
| HOMA-IR | homair, homa | index | LOWER_BETTER | A5 |
| eGFR | egfr, estimated gfr | mL/min/1.73m2 | HIGHER_BETTER | A35 |
| TG/HDL ratio | tghdl, tg/hdl | ratio | LOWER_BETTER | A6 |
| AST/ALT ratio | astalt, de ritis | ratio | CONTEXT_DEPENDENT | A35 |
| Insulin | fasting insulin | uIU/mL | LOWER_BETTER | A5 |
| LDL | ldl-c, ldl cholesterol | mg/dL | LOWER_BETTER | A6 |
| HDL | hdl-c, hdl cholesterol | mg/dL | HIGHER_BETTER | A6 |
| Triglycerides | tg, trig | mg/dL | LOWER_BETTER | A6 |
| Creatinine | cr, serum creatinine | mg/dL | LOWER_BETTER | A35 |
| ALT | sgpt, alt (sgpt) | U/L | LOWER_BETTER | A15 |
| AST | sgot, ast (sgot) | U/L | LOWER_BETTER | A15 |
| Vitamin B12 | b12, cobalamin | pg/mL | HIGHER_BETTER | A26 |
| Homocysteine | hcy | umol/L | LOWER_BETTER | A34 |
| FT3 | free t3 | pg/mL | TARGET_RANGE | A33 |
| FT4 | free t4 | ng/dL | TARGET_RANGE | A33 |
| WBC | white blood cell, leukocyte count | x10^9/L | TARGET_RANGE | A1 |
| Platelets | plt, platelet count | x10^9/L | TARGET_RANGE | A22 |
| Troponin | troponin i, troponin t, hs-troponin | ng/mL | LOWER_BETTER | A23 |

**CONTEXT_DEPENDENT** markers are interpreted only in context. Known silent-drop cases (from the engine rules):

| Marker | Case the engine drops without an error | What to do |
| --- | --- | --- |
| Ferritin | **High** ferritin submitted **without CRP** (ambiguous acute-phase reactant) | Ask for CRP in the same submission; if not available, tell the clinician ferritin will not be used |
| AST/ALT ratio | Ratio that is **not elevated** (only the "up" case maps to an axis) | Expected; mention that a normal ratio adds no axis signal |

Low ferritin is used (maps to A26) and high ferritin with CRP is used (maps to A1).
