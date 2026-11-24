#!/usr/bin/env bash
# Phase 2, run as root through SSM after bootstrap, Atlas allowlisting, and
# explicit approval of the Let's Encrypt Subscriber Agreement. Never use bash -x.
# Usage: bash activate.sh ARTIFACT_BUCKET ARTIFACT_KEY PUBLIC_IPV4 AWS_REGION
set -Eeuo pipefail
set +x
umask 077
export AWS_PAGER='' AWS_CLI_AUTO_PROMPT=off

stage='initialization'
runtime_dir=''
release_dir=''
switched=0
had_env=0
previous_release=''
completed=0

log() { printf '[nova] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if (( status != 0 )); then
    log "ERROR during ${stage} (exit ${status}). No secret values are printed."
    if (( switched == 1 && completed == 0 )); then
      log 'Restoring the previous application and environment, when available.'
      if (( had_env == 1 )); then
        install -o root -g root -m 0600 "$runtime_dir/previous.env" /etc/nova/nova.env || true
      else
        rm -f -- /etc/nova/nova.env
      fi
      if [[ -n "$previous_release" ]]; then
        ln -sfn -- "$previous_release" /opt/nova/.current-rollback
        mv -Tf -- /opt/nova/.current-rollback /opt/nova/current
        systemctl restart nova.service || true
      else
        systemctl stop nova.service || true
        [[ ! -L /opt/nova/current ]] || rm -f -- /opt/nova/current
      fi
    fi
    [[ -z "$release_dir" ]] || log "Release retained for diagnosis: $release_dir"
  fi
  # Only files in this root-owned, fixed-parent mktemp directory are removed.
  if [[ "$runtime_dir" == /run/nova-activate.* && -d "$runtime_dir" ]]; then
    rm -f -- "$runtime_dir"/*
    rmdir -- "$runtime_dir" || true
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[[ $EUID -eq 0 ]] || die 'Run this script as root through Systems Manager.'
[[ $# -eq 4 ]] || die 'Expected: ARTIFACT_BUCKET ARTIFACT_KEY PUBLIC_IPV4 AWS_REGION.'
bucket=$1
artifact_key=$2
public_ip=$3
region=$4

exec 9>/run/lock/nova-activate.lock
flock -n 9 || die 'Another NOVA activation is running.'
runtime_dir=$(mktemp -d /run/nova-activate.XXXXXXXX)
chmod 0700 "$runtime_dir"

stage='waiting for bootstrap'
log 'Waiting for the bootstrap-ready marker (maximum 10 minutes).'
deadline=$((SECONDS + 600))
until [[ -f /var/lib/nova/bootstrap-ready ]]; do
  (( SECONDS < deadline )) || die 'Bootstrap did not finish. Check /var/log/nova-bootstrap.log with SSM.'
  sleep 5
done

stage='validating activation prerequisites'
for executable in aws curl python3.13 runuser openssl nginx systemctl /usr/bin/node-24 /usr/bin/npm-24 /opt/certbot/bin/certbot; do
  command -v "$executable" >/dev/null 2>&1 || die "Required executable not found: $executable"
done

python3.13 - "$bucket" "$artifact_key" "$public_ip" "$region" <<'PY'
import ipaddress
import re
import sys

bucket, key, address, region = sys.argv[1:]
if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket):
    raise SystemExit("Invalid artifact bucket name.")
if not key or key.startswith("/") or any(ord(c) < 32 for c in key):
    raise SystemExit("Invalid artifact key.")
try:
    ip = ipaddress.IPv4Address(address)
except ipaddress.AddressValueError:
    raise SystemExit("A valid public IPv4 address is required.") from None
if not ip.is_global:
    raise SystemExit("The certificate requires the instance's public Elastic IP.")
if not re.fullmatch(r"[a-z]{2}(?:-gov)?-[a-z]+-[0-9]+", region):
    raise SystemExit("Invalid AWS Region.")
PY

id nova >/dev/null 2>&1 || die 'Bootstrap did not create the nova service user.'
[[ -f /etc/systemd/system/nova.service ]] || die 'Bootstrap did not install nova.service.'
systemctl is-active --quiet nginx.service || die 'Nginx must serve the ACME challenge on port 80.'
nginx -t

stage='downloading and validating the release'
install -d -o root -g root -m 0755 /opt/nova/releases /etc/nova /opt/nova/node24-bin
release_dir=$(mktemp -d "/opt/nova/releases/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
aws s3 cp "s3://${bucket}/${artifact_key}" "$runtime_dir/release.zip" \
  --region "$region" --only-show-errors --no-progress

python3.13 - "$runtime_dir/release.zip" "$release_dir" <<'PY'
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

archive_path, destination = sys.argv[1:]
required = {"package.json", "package-lock.json", "backend/src/server.js",
            "frontend/dist/frontend/browser/index.html"}
with zipfile.ZipFile(archive_path) as archive:
    names = set()
    total = 0
    for item in archive.infolist():
        name = item.filename
        parts = PurePosixPath(name).parts
        mode = item.external_attr >> 16
        if (not parts or name.startswith("/") or "\\" in name or ":" in parts[0]
                or ".." in parts or name in names
                or stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
            raise SystemExit("Release ZIP contains an unsafe or duplicate entry.")
        if (".git" in parts or "node_modules" in parts
                or any(part == ".env" or (part.startswith(".env.") and part != ".env.example")
                       for part in parts)):
            raise SystemExit("Release ZIP must not contain credentials, Git data, or node_modules.")
        names.add(name)
        total += item.file_size
    if total > 512 * 1024 * 1024 or not required.issubset(names):
        raise SystemExit("Release is too large or missing the backend/compiled Angular files.")
    archive.extractall(destination)
root = Path(destination)
try:
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
except (ValueError, UnicodeError):
    raise SystemExit("Release package.json is invalid.") from None
if not package.get("dependencies"):
    raise SystemExit("Release package.json must contain the backend production dependencies.")
PY

stage='installing production dependencies'
# Pin child-process shebangs to Node 24 without changing the system Python/Node.
ln -sfn /usr/bin/node-24 /opt/nova/node24-bin/node
ln -sfn /usr/bin/npm-24 /opt/nova/node24-bin/npm
chmod 0755 "$release_dir"
chown -R nova:nova "$release_dir"
(
  cd "$release_dir"
  runuser -u nova -- env HOME=/var/lib/nova \
    PATH="/opt/nova/node24-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin" \
    /usr/bin/npm-24 ci --omit=dev --no-audit --no-fund
)
[[ -s "$release_dir/frontend/dist/frontend/browser/index.html" ]] || die 'Compiled Angular index.html is empty.'

stage='loading encrypted configuration'
# AWS values are redirected into tmpfs, never interpolated into a command line.
aws ssm get-parameters --region "$region" --with-decryption --output json \
  --names /nova/prod/mongodb-uri /nova/prod/jwt-secret > "$runtime_dir/parameters.json"
python3.13 - "$runtime_dir/parameters.json" "$runtime_dir/new.env" <<'PY'
import json
import os
from pathlib import Path
import sys

source, output = map(Path, sys.argv[1:])
try:
    response = json.loads(source.read_text(encoding="utf-8"))
    parameters = response["Parameters"]
except (ValueError, KeyError, TypeError):
    raise SystemExit("Parameter Store returned an invalid response.") from None
expected = {"/nova/prod/mongodb-uri": "MONGODB_URI", "/nova/prod/jwt-secret": "JWT_SECRET"}
if response.get("InvalidParameters") or len(parameters) != len(expected):
    raise SystemExit("Both required SecureString parameters must exist.")
values = {}
for parameter in parameters:
    name, value = parameter.get("Name"), parameter.get("Value")
    if (name not in expected or name in values or parameter.get("Type") != "SecureString"
            or not isinstance(value, str) or not value
            or any(ord(char) < 32 or ord(char) == 127 for char in value)):
        raise SystemExit("Required SecureString parameter is missing or invalid.")
    values[name] = value
if not values["/nova/prod/mongodb-uri"].startswith(("mongodb://", "mongodb+srv://")):
    raise SystemExit("MongoDB parameter must contain a MongoDB connection URI.")
if len(values["/nova/prod/jwt-secret"]) < 32:
    raise SystemExit("JWT secret must contain at least 32 characters.")
# systemd EnvironmentFile is not a shell: no expansion of dollars or backticks.
def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
content = "NODE_ENV=production\nPORT=3000\n"
content += "".join(f"{expected[name]}={quote(values[name])}\n" for name in expected)
with output.open("x", encoding="utf-8", newline="\n") as stream:
    stream.write(content)
os.chmod(output, 0o600)
PY
rm -f -- "$runtime_dir/parameters.json"

stage='starting the application'
if [[ -e /opt/nova/current && ! -L /opt/nova/current ]]; then
  die '/opt/nova/current must be a release symlink.'
fi
if [[ -L /opt/nova/current ]]; then
  previous_release=$(readlink /opt/nova/current)
fi
if [[ -f /etc/nova/nova.env ]]; then
  cp -p -- /etc/nova/nova.env "$runtime_dir/previous.env"
  had_env=1
fi
switched=1
install -o root -g root -m 0600 "$runtime_dir/new.env" /etc/nova/nova.env
rm -f -- "$runtime_dir/new.env"
ln -sfn -- "$release_dir" /opt/nova/.current-next
mv -Tf -- /opt/nova/.current-next /opt/nova/current
systemctl daemon-reload
systemctl enable nova.service >/dev/null
systemctl restart nova.service

wait_ready() {
  local attempts=30
  until curl --fail --silent --max-time 5 --noproxy '*' "$@" \
      --output "$runtime_dir/ready.json" \
      && python3.13 - "$runtime_dir/ready.json" <<'PY'
import json
import sys
try:
    with open(sys.argv[1], encoding="utf-8") as stream:
        body = json.load(stream)
    healthy = body.get("status") == "ready"
except (OSError, ValueError, AttributeError):
    healthy = False
raise SystemExit(0 if healthy else 1)
PY
  do
    attempts=$((attempts - 1))
    (( attempts > 0 )) || return 1
    sleep 3
  done
}
wait_ready http://127.0.0.1:3000/api/ready \
  || die 'API did not connect to MongoDB. Check Atlas IP access and nova.service via SSM.'
log 'Backend and MongoDB are ready locally; enabling trusted HTTPS next.'

stage='issuing or reusing the IP certificate'
# Reusing the same IP does not force a new certificate or consume extra issuances.
if [[ -f /etc/letsencrypt/live/nova-ip/cert.pem ]]; then
  openssl x509 -in /etc/letsencrypt/live/nova-ip/cert.pem -noout -checkip "$public_ip" >/dev/null \
    || die 'Existing nova-ip certificate belongs to another IP; review before replacing it.'
fi
/opt/certbot/bin/certbot certonly --non-interactive --agree-tos \
  --register-unsafely-without-email --cert-name nova-ip --keep-until-expiring \
  --webroot --webroot-path /var/www/letsencrypt --preferred-profile shortlived \
  --ip-address "$public_ip"

stage='configuring Nginx HTTPS'
cp -p -- /etc/nginx/conf.d/nova.conf "$runtime_dir/previous-nginx.conf"
cat > "$runtime_dir/nova.conf" <<NGINX
server {
    listen 80 default_server;
    server_name ${public_ip};
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 301 https://${public_ip}\$request_uri; }
}
server {
    listen 443 ssl default_server;
    server_name ${public_ip};
    ssl_certificate /etc/letsencrypt/live/nova-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nova-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
NGINX
install -o root -g root -m 0644 "$runtime_dir/nova.conf" /etc/nginx/conf.d/nova.conf
if ! nginx -t; then
  install -o root -g root -m 0644 "$runtime_dir/previous-nginx.conf" /etc/nginx/conf.d/nova.conf
  die 'Nginx rejected the HTTPS configuration; its previous config was restored.'
fi
systemctl reload nginx.service

stage='configuring automatic certificate renewal'
install -d -o root -g root -m 0755 /usr/local/libexec
cat > /usr/local/libexec/nova-certbot-deploy-hook <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx.service
HOOK
chmod 0755 /usr/local/libexec/nova-certbot-deploy-hook
cat > /etc/systemd/system/nova-certbot-renew.service <<'UNIT'
[Unit]
Description=Renew the NOVA public IP certificate when due
Wants=network-online.target
After=network-online.target nginx.service

[Service]
Type=oneshot
ExecStart=/opt/certbot/bin/certbot renew --quiet --cert-name nova-ip --deploy-hook /usr/local/libexec/nova-certbot-deploy-hook
UNIT
cat > /etc/systemd/system/nova-certbot-renew.timer <<'TIMER'
[Unit]
Description=Check NOVA certificate renewal twice a day

[Timer]
OnBootSec=5min
OnUnitActiveSec=12h
RandomizedDelaySec=15min
Unit=nova-certbot-renew.service

[Install]
WantedBy=timers.target
TIMER
chmod 0644 /etc/systemd/system/nova-certbot-renew.{service,timer}
systemctl daemon-reload
systemctl enable --now nova-certbot-renew.timer >/dev/null

stage='verifying TLS and readiness'
# Connect to loopback while validating the certificate against the public IP.
# An external client still needs to verify the actual Internet route afterwards.
wait_ready --connect-to "${public_ip}:443:127.0.0.1:443" "https://${public_ip}/api/ready" \
  || die 'HTTPS or API readiness verification failed; no certificate bypass was used.'
completed=1
log "Activation complete: https://${public_ip}/ (TLS and database verified locally)."
log 'Next: verify HTTPS from an external client and check the renewal timer with SSM.'
