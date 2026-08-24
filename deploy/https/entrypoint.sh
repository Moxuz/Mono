#!/bin/sh
set -eu

: "${AUTH_HOST:?AUTH_HOST is required}"
: "${CLIENT_HOST:?CLIENT_HOST is required}"
: "${CLIENT2_HOST:?CLIENT2_HOST is required}"
: "${CERT_NAME:?CERT_NAME is required}"
: "${CLIENT2_CERT_NAME:?CLIENT2_CERT_NAME is required}"

envsubst '${AUTH_HOST} ${CLIENT_HOST} ${CLIENT2_HOST} ${CERT_NAME} ${CLIENT2_CERT_NAME}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
