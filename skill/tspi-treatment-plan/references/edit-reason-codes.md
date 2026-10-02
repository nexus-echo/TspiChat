# Edit actions and reason codes for tspi_update_treatment_plan

Every edit action needs one reason code. Pick the closest match; put detail in `rationale`.

| Action | Use it to | Required fields |
| --- | --- | --- |
| REMOVE_MODULE | Take a module out of the plan | module_code |
| REJECT_MODULE | Mark a module as clinically rejected (kept in the record) | module_code |
| CHANGE_DOSE | Change a module's dose | module_code, new_dose |
| OVERRIDE_SAFETY | Keep a module despite an engine safety flag (needs a strong rationale) | module_code, rationale |
| ADD_SECONDARY_AXIS | Add a secondary axis the engine did not include | axis_code |
| REMOVE_SECONDARY_AXIS | Remove a secondary axis | axis_code |
| ADD_NOTE | Add a clinician note to the plan | rationale |

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

Editing a plan invalidates any earlier approval; the plan must be approved again.
