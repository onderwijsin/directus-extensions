# Test patterns and useful contrasts

| Lead                                    | Evidence of low value                                                                                                       | Preserve or improve when                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fixture or mock asserted against itself | Setup guarantees the assertion and no relevant production behavior runs.                                                    | A real adapter runs and the assertion observes its external payload, result or state.                                       |
| Implementation-derived expectation      | Calling the subject or repeating its algorithm supplies the expected answer and shares its likely defects.                  | An independent example, property or genuinely different reference method can fail differently.                              |
| Source or private-shape assertion       | A harmless rename or extraction fails the test while every supported result stays the same.                                 | The structure itself is a published import, generated artifact or enforced architectural contract.                          |
| Interaction assertions                  | Internal helper order or count merely transcribes today's call graph.                                                       | Order or count controls a transaction, resource lifecycle, billing, retry limit or idempotency promise.                     |
| Snapshot                                | Unreviewed recorded output hides the meaningful signal or requires accepting changes without a criterion.                   | The rendered or serialized artifact is the reviewed contract, or the snapshot deliberately characterizes existing behavior. |
| Weak assertion                          | Non-null, type, length or existence checks add no protection beyond a stronger assertion of the same result.                | Presence, cardinality or type is itself a meaningful result or catches a distinct plausible regression.                     |
| Similar test cases                      | Cases exercise the same contract, input class, path and failure mode with equivalent evidence.                              | They protect distinct supported outcomes, runtime boundaries or concrete regression risks.                                  |
| Misuse permutations                     | An input matrix enumerates hypothetical misuse without a supported rejection contract or concrete risk.                     | Cases protect a specified failure outcome or a concrete regression risk in the intended workflow.                           |
| Private-helper coverage                 | A helper's mechanics are re-tested without a separate invariant beyond existing public coverage.                            | The helper has an independently specified algorithm or invariant that higher-level tests cannot adequately check.           |
| Heavy fixture stack                     | Builders and fakes maintain obsolete setup and have no surviving consumer.                                                  | They reach a supported path; simplify setup while preserving that behavior.                                                 |
| Disconnected layer tests                | Producer and reader each pass against their own fixtures, but neither checks the identity or format crossing the real path. | Existing coverage crosses that boundary, or a concrete regression justifies one focused check.                              |
| Generated or local artifact             | A default test depends on an untracked developer output or overwrites repository-owned data.                                | Inputs are managed or test-created and generated outputs go to a temporary location.                                        |
| Skip unrelated to execution             | A fake-backed test skips for an optional service or SDK it never invokes.                                                   | Execution really crosses the absent dependency; keep the skip tied to that boundary.                                        |

## Contrasts

- `expect(mockResult).toEqual(configuredMockResult)` exercises setup. Calling the production
  mail adapter and checking the recipient and payload at its boundary can expose a real bug.
- Two formatting cases with the same ordinary input class may overlap; a missing required
  field and a valid field protect different outcomes even when their setup looks alike.
- A one-line assertion that a parser rejects malformed external data can be valuable. The
  TypeScript input type does not remove that runtime contract.
- A checksum calculated and checked with the same helper is weak evidence. A reader checked
  against an independently supplied digest or known corrupt artifact protects a real boundary.
- A broad integration test can miss a rounding error that a short known-value unit test finds.
  Prefer the smallest sufficient evidence for each failure, rather than one test level.
- A mocked adapter can prove the application chooses the specified payload, but cannot by
  itself prove real SDK serialization, framework registration or persistence wiring. Use a
  focused real integration or E2E test when that runtime behavior is the contract to establish.
- A pre-release bug fix may need only an improved existing workflow test and a focused
  reproduction. Recommend a permanent regression case only when it adds meaningful protection.
- An explicit new requirement can make an older expectation obsolete. A preference inferred
  from a cleanup request cannot supply that authority.

When proposing consolidation, name the surviving case and the regression it still detects.
When proposing removal, state what protection disappears. Required behavior and its fixture
are separate decisions: retire obsolete support without silently retiring a supported contract.
