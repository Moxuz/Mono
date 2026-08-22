FROM nginx:alpine

RUN apk add --no-cache gettext

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /usr/local/bin/render-nginx-config
RUN chmod +x /usr/local/bin/render-nginx-config

ENTRYPOINT ["/usr/local/bin/render-nginx-config"]
