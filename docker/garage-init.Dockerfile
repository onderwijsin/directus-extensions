# Keep this digest in sync with the garage service in compose.yaml.
# The manifest contains the supported Garage architectures; Docker selects the
# matching platform-specific image when this image is built.
FROM dxflrs/garage:v2.3.0@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690 AS garage

FROM alpine:3.22

COPY --from=garage /garage /usr/local/bin/garage
COPY docker/garage-init.sh /usr/local/bin/garage-init.sh

RUN chmod +x /usr/local/bin/garage /usr/local/bin/garage-init.sh

ENTRYPOINT ["/bin/sh", "/usr/local/bin/garage-init.sh"]
