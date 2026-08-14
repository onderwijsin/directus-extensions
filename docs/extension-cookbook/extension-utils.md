# `extension-utils`

`extension-utils` is the publishable, framework-neutral helper package. It should contain helpers
with stable semantics and more than one credible consumer. Extension-specific behavior stays in the
owning extension.

The initial slice ports the primitive guards from the Nuxt module-utils package. They are runtime
type predicates and must not become a schema system, coercion layer, or replacement for Zod.

Use public package subpaths, keep runtime dependencies intentional, test exports, and ensure private
test utilities never leak into the published package.
