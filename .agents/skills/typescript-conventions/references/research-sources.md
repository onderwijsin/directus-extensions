# Research sources

Consulted 14 November 2026. These are primary sources: language/tool documentation, original
organizational guides and standards publications. The taxonomy in this skill is an operational
synthesis, not a definition quoted from a single universal standard. Examples are original,
framework-independent illustrations rather than copied source-project implementations.

## Contents

- [What defines standards and conventions](#what-defines-standards-and-conventions)
- [TypeScript semantics](#typescript-semantics)
- [Tools and runtime contracts](#tools-and-runtime-contracts)
- [Boundary and documentation practices](#boundary-and-documentation-practices)
- [How to apply this evidence](#how-to-apply-this-evidence)

## What defines standards and conventions

| Primary source                                                                                                       | Research finding                                                                                                         | Incorporated in                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [Google: the standard of code review](https://google.github.io/eng-practices/review/reviewer/standard.html)          | Separates documented standards and engineering reasoning from personal preference; improvement need not mean perfection. | Authority and requirement/recommendation distinctions in [Standards and discovery](standards-and-discovery.md)    |
| [Google: what to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html) | Treats design, functionality, complexity, tests, naming, comments, style and documentation as distinct concerns.         | The scope of a coding standard, beyond mechanical formatting; no additional review workflow imported              |
| [Google TS/JS style guide](https://google.github.io/styleguide/tsguide.html)                                         | Explicitly cautions that Google's environment has different constraints from external projects.                          | Local style authority; selected naming and type-import concepts, without copying Google's entire policy           |
| [TypeScript contributor coding guidelines](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines)           | Explicitly says its contributor rules are not prescriptive for the TypeScript community.                                 | No claim of universal TypeScript file layout, quotes, declaration style or null policy                            |
| [PEP 8: consistency](https://peps.python.org/pep-0008/#a-foolish-consistency-is-the-hobgoblin-of-little-minds)       | Distinguishes guide, project and local consistency and cautions against compatibility-breaking style compliance.         | Principle of scoped consistency; no Python syntax rules transferred to TypeScript                                 |
| [NIST SP 800-218, SSDF 1.1](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf)               | PW.5.1 makes secure coding language/environment-specific; PW.7 connects review/analysis to organizational requirements.  | Standards as scoped expectations with assessable enforcement; no compliance claim or new security-review workflow |
| [ISO/IEC 25010:2023 official abstract](https://www.iso.org/standard/78176.html)                                      | Describes a product quality model used for requirements, evaluation and acceptance criteria.                             | Distinction between quality outcomes and stylistic preferences; only the public abstract was consulted            |

The synthesis: a useful coding standard identifies an expectation, its scope, reason,
assessment method and exception policy. A convention can exist before formal adoption;
observing it does not make it mandatory. A style guide covers part of the standard, and tool
configuration enforces only the subset it can express. This taxonomy is a practical organizing
model; different organizations use the terms differently.

## TypeScript semantics

| Primary source                                                                                                                       | Verified point                                                                                                 | Incorporated in                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Handbook: everyday types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)                                       | Assertions are removed and add no runtime checking; nullability and literal inference have distinct semantics. | Parsing, assertions, optionality and authored literal intent    |
| [Handbook: narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)                                                 | Control flow, predicates, discriminated unions and `never` support narrowing and exhaustive checks.            | Explicit guards and valid-state examples                        |
| [TypeScript 4.9: `satisfies`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator) | Checks compatibility while preserving useful expression inference.                                             | Typed defaults and strategy registries                          |
| [TSConfig: `strict`](https://www.typescriptlang.org/tsconfig/strict.html)                                                            | Enables a strict-checking family; future versions may add checks.                                              | Compiler configuration qualifications                           |
| [TSConfig: `noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html)                        | Potentially absent indexed fields include `undefined`.                                                         | Lookup conventions and compiler-option matrix                   |
| [TSConfig: `exactOptionalPropertyTypes`](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)                    | An absent optional property and explicit `undefined` need not be interchangeable.                              | Raw/resolved options and presence semantics                     |
| [TSConfig reference](https://www.typescriptlang.org/tsconfig/)                                                                       | Documents option-specific behavior and relationships.                                                          | Additional compiler flags; verify against the installed version |

The examples use ordinary TypeScript constructs, including `satisfies` and modern narrowing.
Their presence does not set a supported compiler version for the target project. Check its
installed version before using newer syntax. Type checking is not runtime enforcement.

## Tools and runtime contracts

| Primary source                                                                                                                      | Verified point                                                                                                                 | Incorporated in                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [TypeScript: choosing compiler options](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html) | Module configuration depends on execution/delivery; bundler resolution can hide incompatible external imports or declarations. | Delivery-model distinctions; no one-size-fits-all configuration                                                |
| [Node: packages](https://nodejs.org/api/packages.html)                                                                              | Package `type`, entries, subpaths and conditions participate in runtime resolution.                                            | Public module surfaces and runtime/type export alignment                                                       |
| [Prettier versus linters](https://prettier.io/docs/comparison)                                                                      | Separates formatting from code-quality rule responsibilities.                                                                  | Tool ownership; does not prescribe Prettier as a dependency                                                    |
| [Prettier rationale](https://prettier.io/docs/rationale)                                                                            | Formatting choices are opinionated and aim to preserve behavior.                                                               | Mechanical settings remain with the adopted formatter                                                          |
| [ESLint: configuring rules](https://eslint.org/docs/latest/use/configure/rules)                                                     | Rules have configured options, severities and scoped configuration mechanisms.                                                 | Effective configuration and exception scope                                                                    |
| [typescript-eslint: typed linting](https://typescript-eslint.io/getting-started/typed-linting/)                                     | Some rules require type information and have an analysis cost.                                                                 | Type-aware rule coverage must be established, not assumed                                                      |
| [typescript-eslint: floating promises](https://typescript-eslint.io/rules/no-floating-promises/)                                    | Unowned promises are hazardous; `void` does not handle rejection.                                                              | Promise ownership and anti-pattern contrasts                                                                   |
| [Semantic Versioning 2.0.0](https://semver.org/)                                                                                    | Version interpretation depends on a declared public API.                                                                       | Public types, accepted options and subpaths as consumer contracts; use the project's adopted versioning policy |

Live documentation can describe newer tools than a project has installed. Verify a feature
against its actual version; a source link is evidence, not permission to upgrade dependencies.
No particular linter, formatter, schema library, package manager or runtime is required here.

## Boundary and documentation practices

- [OWASP input validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
  distinguishes shape/semantic checks from authorization and sink-specific defenses. This informs
  parser examples and the distinction between validation and SQL/HTML/path safety.
- [OWASP logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  identifies secrets and sensitive values that should not be logged directly. This informs
  error metadata conventions rather than a new logging framework or audit procedure.
- [TSDoc](https://tsdoc.org/) describes a proposal for interoperable TypeScript documentation
  comments. This informs comment syntax and tool compatibility; TSDoc is not a requirement to
  document every private function.

## How to apply this evidence

Use local contracts first. External references support a decision or explain language/tool
semantics; they are not a second configuration to impose. Defaults are recommendations until
adopted. Preserve the distinction between formal publications, organizational conventions,
tool behavior and this skill's synthesis. Refer to the active coding workflow for investigation,
implementation, review, cleanup and test decisions.

The references are bundled so normal convention work does not require web access. Follow links
when a version-sensitive or disputed point needs current primary-source verification. This
material does not establish compliance with NIST, ISO or a security standard.
