# Calculate Centroid Operation

Area-weighted and spherical vertex centroids return a Point geometry. `app.ts` exposes the
source/destination, merge policies and calculation options. `api.ts` validates configuration and
delegates to the pure transform in `utils/transform.ts`. Shared modules validate Polygon input,
project local geometry and preserve complete item payloads.

See [consumer setup and options](../../README.md#polygon-transforms).
