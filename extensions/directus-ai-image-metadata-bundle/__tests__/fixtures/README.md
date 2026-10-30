# Image fixtures

The tiny red JPEG, PNG, WebP, AVIF, TIFF and GIF fixtures were generated locally for image transport
and Directus transformation regression tests. They contain no third-party content.

The `oriented.jpeg`, `oriented.tiff`, and `oriented.avif` fixtures encode an 80×40 red/green split
with EXIF orientation 6 (the AVIF encoder bakes that orientation into its pixels). Directus must
expose 40×80 oriented dimensions and send its corresponding WebP derivative to the model. They were
generated locally with Sharp 0.35.3 using raw RGB pixels, `withMetadata({ orientation: 6 })`, and
each format encoder. They contain no third-party content. These fixtures verify coordinate frames,
not semantic model accuracy or crop quality.

The `output-limit.jpeg` (2048×3072) and `output-limit.png` (924×4453) fixtures are solid RGB images
generated locally with Sharp 0.35.3. They exceed Directus 12.2's default 3000-pixel output limit
while staying below its 6000-pixel source limit. Preparation must resize these images before
encoding to keep the derivative within that output limit, including when focal points are requested.
