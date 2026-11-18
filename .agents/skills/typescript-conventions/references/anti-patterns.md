# TypeScript anti-patterns

Use these as concrete language/API contrasts within the current task. A matching syntax shape
is a lead; its actual semantics and the adopted project contract determine whether it is wrong.
Generic complexity, necessity and test-value judgments belong to their existing workflows.

| Shortcut                                                       | Hidden consequence                                     | Prefer                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `JSON.parse(text) as Config`                                   | No runtime check of the parsed value                   | Bind to `unknown`, then use the owning parser              |
| `fetchJson<Config>()` treated as validation                    | Generic response annotation may only assert a type     | Confirm the client's guarantee and parse when required     |
| `value!` for an uncertain lookup                               | Removes the warning without establishing existence     | Narrow the lookup or model guaranteed presence             |
| `as unknown as Target` across a production boundary            | Hides incompatible representations                     | An explicit translation or narrow, evidenced adapter       |
| A predicate checks one field but claims a complete object      | Unsound narrowing                                      | Validate every property needed by the claimed type         |
| `Boolean(env.FLAG)`                                            | The string `false` becomes `true`                      | Parse documented boolean spellings                         |
| `option \|\| fallback` for false/zero-aware options            | Replaces deliberate falsy values                       | Nullish or explicit-presence resolution                    |
| Spread layers containing `undefined`                           | Can erase effective defaults                           | Defined-value precedence consistent with the contract      |
| `Partial<ResolvedConfig>` as every input model                 | Allows combinations the public format cannot mean      | Separate raw and resolved types                            |
| Several booleans encode exclusive states                       | Contradictory combinations remain representable        | A discriminated union or mode literal                      |
| `Record<string, T>` assumed to guarantee any lookup            | Missing keys still occur at runtime                    | Narrow access; consider indexed-access checking            |
| `readonly` treated as runtime freezing                         | Aliases or external code can still mutate data         | Use it as a type-level ownership contract                  |
| `satisfies` treated as a parser                                | External values remain unchecked                       | Runtime validation at the relevant boundary                |
| `array.forEach(async ...)`                                     | The loop does not await callbacks                      | An awaited loop or the intended promise aggregation        |
| `await array.map(async ...)`                                   | Awaits an array rather than its promises               | Await the intended aggregation                             |
| `void promise` assumed to handle rejection                     | Rejection is still unhandled                           | An owner with rejection/lifetime handling                  |
| `return operation()` before a releasing `finally`              | Resource may be released before completion             | `return await operation()` in that scope                   |
| `Promise.all` treated as rollback                              | Other work can continue after rejection                | Explicit transaction/cancellation semantics where required |
| A timeout race treated as cancellation                         | Losing operation continues                             | Propagate the supported cancellation mechanism             |
| `catch (error) { return [] }` for backend failure              | Failure becomes indistinguishable from valid emptiness | Adopted error/result contract with distinct outcomes       |
| Matching error message text as a protocol                      | Wording changes break recovery                         | Documented code/status or provider guard                   |
| Error prototype assumed to survive JSON                        | `instanceof` cannot recognize the transported shape    | A documented serialized error representation               |
| Shared barrel re-exports server-only code to browser consumers | Transitive imports cross execution domains             | Explicit domain-safe entry points                          |
| Compiler aliases assumed to rewrite output                     | Published imports can remain unresolved                | Matching build/runtime resolution                          |
| Editing generated declarations directly                        | Next generation removes the edit                       | Edit the owning types or generator                         |
| Mandatory methods default to successful no-ops                 | Missing capabilities masquerade as success             | Required implementations or narrower capability types      |

An intentionally tolerant parser, background task or no-op can be a valid contract. State its
semantics accurately; do not "correct" it solely because it resembles a row in this table.
