---
"utils": patch
---

Different database providers, have different ways of declaring field schema.
This causes the field and relation config checker to throw (unnecesary) errors.
Implemented some additional checks, but far from perfect.

Created a new issue to track progress on this point
