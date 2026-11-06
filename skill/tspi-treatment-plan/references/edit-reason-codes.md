# Reason codes for plan adjustments and corrections

Every adjustment or correction needs one reason code. Pick the closest match; put detail in `rationale`.

Used by `plan_adjust_step_mcp_tspi` (exclude_axis, include_axis, remove_module, add_module,
change_dose) and `propose_change_mcp_tspi` (record and plan corrections).

| Reason code | When to use |
| --- | --- |
| NEW_CLINICAL_INFORMATION | Information the engine did not have (new lab, history) |
| PATIENT_PREFERENCE | Patient declines or prefers an alternative |
| SAFETY_CONCERN | Interaction, contraindication or tolerance concern |
| REGISTRY_ERROR | The module or marker registry looks wrong |
| ALGORITHM_ERROR | The engine's reasoning looks wrong |
| CLINICAL_JUDGMENT | Physician judgement without a more specific reason |
| DIAGNOSTIC_UNCERTAINTY | Diagnosis not yet confirmed |
| TREATMENT_RESPONSE | Based on how the patient responded so far |

A plan correction makes a new version, which must be approved again.
