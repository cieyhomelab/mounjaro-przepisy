#!/usr/bin/env bash
# Pure helpers for .env (docs/adr/0003-instalator-na-serwer.md): parser, validation rules,
# domain derivation and atomic writes. No Docker calls. Source it, do not execute.
# The file is read by the parser below, never by `source`.

# Temporary files created by env_write_value; the caller's EXIT trap runs env_cleanup_tmp.
ENV_TMP_FILES=()

env_cleanup_tmp() {
  local file
  for file in "${ENV_TMP_FILES[@]}"; do
    rm -f "$file"
  done
  ENV_TMP_FILES=()
}

# env_parse <file>: fills ENV_VALUES (key -> value of the first occurrence, quotes removed),
# ENV_COUNTS (key -> number of occurrences) and ENV_KEYS (keys in file order, once each).
# Recognised: blank lines, comments, [export ]KEY=value. Other lines are ignored.
env_parse() {
  local file="$1" line key value
  local re='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$'
  declare -gA ENV_VALUES=() ENV_COUNTS=()
  ENV_KEYS=()
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ $re ]] || continue
    key="${BASH_REMATCH[2]}"
    value="$(env_unquote "${BASH_REMATCH[3]}")"
    if [ -z "${ENV_COUNTS[$key]:-}" ]; then
      ENV_VALUES[$key]="$value"
      ENV_COUNTS[$key]=1
      ENV_KEYS+=("$key")
    else
      ENV_COUNTS[$key]=$((ENV_COUNTS[$key] + 1))
    fi
  done <"$file"
}

# env_unquote <raw>: removes one pair of surrounding quotes; unquoted values lose a trailing
# " # comment" and surrounding spaces, like Compose does.
env_unquote() {
  local raw="$1"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  if [[ "$raw" =~ ^\"(.*)\"$ ]] || [[ "$raw" =~ ^\'(.*)\'$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  raw="${raw%%[[:space:]]#*}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  printf '%s' "$raw"
}

# env_value <key>: value from the last env_parse, empty when absent.
env_value() {
  printf '%s' "${ENV_VALUES[$1]:-}"
}

env_valid_host() {
  local host="$1" label
  local -a labels
  [[ "$host" == *.* ]] || return 1
  IFS=. read -r -a labels <<<"$host."
  [ "${#labels[@]}" -ge 2 ] || return 1
  for label in "${labels[@]}"; do
    [[ "$label" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]] || return 1
  done
}

# env_domain_from_url <APP_BASE_URL>: host part, without port. Empty for a malformed URL.
env_domain_from_url() {
  local url="$1"
  if [[ "$url" =~ ^https://([^/:]+)(:[0-9]+)?$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

# env_url_from_domain <APP_DOMAIN>
env_url_from_domain() {
  printf 'https://%s' "$1"
}

# env_problems: validates the parsed file (call env_parse first) and prints one line per
# problem: "<NAME><TAB><what is wrong>". Never prints a value. Empty values are not reported
# here (K3–K6 fill them before K7); duplicated keys are reported and not validated further.
env_problems() {
  local key mode domain url host port
  for key in "${ENV_KEYS[@]}"; do
    if [ "${ENV_COUNTS[$key]}" -gt 1 ]; then
      printf '%s\tklucz występuje w .env więcej niż raz\n' "$key"
    fi
  done
  _env_valid() { [ "${ENV_COUNTS[$1]:-0}" -le 1 ]; }

  mode="$(env_value HTTPS_MODE)"
  if _env_valid HTTPS_MODE && [ -n "$mode" ] && [ "$mode" != caddy ] && [ "$mode" != proxy ]; then
    printf 'HTTPS_MODE\tdozwolone wartości: caddy, proxy\n'
    mode=''
  fi
  if _env_valid PUSH_MODE && [ -n "$(env_value PUSH_MODE)" ] && [ "$(env_value PUSH_MODE)" != web-push ]; then
    printf 'PUSH_MODE\tdozwolona wartość: web-push\n'
  fi
  if _env_valid AUTH_MODE && [ -n "$(env_value AUTH_MODE)" ] && [ "$(env_value AUTH_MODE)" != google ]; then
    printf 'AUTH_MODE\tdozwolona wartość: google\n'
  fi

  domain="$(env_value APP_DOMAIN)"
  if _env_valid APP_DOMAIN; then
    if [ -n "$domain" ] && ! env_valid_host "$domain"; then
      printf 'APP_DOMAIN\tpowinna być nazwą hosta (np. przepisy.example.pl), bez https:// i ścieżki\n'
      domain=''
    elif [ -z "$domain" ] && [ "$mode" = caddy ]; then
      printf 'APP_DOMAIN\twartość jest wymagana w wariancie caddy\n'
    fi
  else
    domain=''
  fi

  url="$(env_value APP_BASE_URL)"
  if _env_valid APP_BASE_URL && [ -n "$url" ]; then
    host='' port=''
    if [[ "$url" =~ ^https://([^/:]+)(:([0-9]+))?$ ]]; then
      host="${BASH_REMATCH[1]}"
      port="${BASH_REMATCH[3]:-}"
    fi
    if [ -n "$host" ] && env_valid_host "$host"; then
      if [ -n "$port" ] && { [ "$mode" != proxy ] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; }; then
        printf 'APP_BASE_URL\tnumer portu jest dozwolony tylko w wariancie proxy i w zakresie 1–65535\n'
      elif [ "$mode" = caddy ] && [ -n "$domain" ] && [ "$host" != "$domain" ]; then
        printf 'APP_BASE_URL\thost musi być taki sam jak w APP_DOMAIN (wariant caddy)\n'
      fi
    else
      printf 'APP_BASE_URL\tpowinien mieć postać https://host, bez ścieżki i końcowego ukośnika\n'
    fi
  fi

  if _env_valid ALLOWED_EMAIL && [ -n "$(env_value ALLOWED_EMAIL)" ] \
    && ! [[ "$(env_value ALLOWED_EMAIL)" =~ ^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$ ]]; then
    printf 'ALLOWED_EMAIL\tpowinien mieć postać adres@domena.tld\n'
  fi
  if _env_valid BACKUP_AGE_RECIPIENT && [ -n "$(env_value BACKUP_AGE_RECIPIENT)" ] \
    && [[ "$(env_value BACKUP_AGE_RECIPIENT)" != age1* ]]; then
    printf 'BACKUP_AGE_RECIPIENT\tklucz publiczny age powinien zaczynać się od age1\n'
  fi
}

# env_write_value <file> <key> <value>: sets one value atomically. An empty `KEY=` line is
# filled in place; a missing key is appended. The rest of the file stays byte for byte.
# The new file is built next to the old one with mode 600 and moved over it.
env_write_value() {
  local file="$1" key="$2" value="$3" tmp line done=0
  local re="^[[:space:]]*(export[[:space:]]+)?${key}=[[:space:]]*$"
  tmp="$(mktemp "$(dirname "$file")/.env.XXXXXX")"
  ENV_TMP_FILES+=("$tmp")
  chmod 600 "$tmp"
  {
    while IFS= read -r line || [ -n "$line" ]; do
      if [ "$done" -eq 0 ] && [[ "$line" =~ $re ]]; then
        printf '%s%s=%s\n' "${BASH_REMATCH[1]}" "$key" "$value"
        done=1
      else
        printf '%s\n' "$line"
      fi
    done <"$file"
    if [ "$done" -eq 0 ]; then
      printf '%s=%s\n' "$key" "$value"
    fi
  } >"$tmp"
  mv -f "$tmp" "$file"
}

# env_copy_file <source> <target>: copies a file atomically with mode 600 (K2).
env_copy_file() {
  local source="$1" target="$2" tmp
  tmp="$(mktemp "$(dirname "$target")/.env.XXXXXX")"
  ENV_TMP_FILES+=("$tmp")
  chmod 600 "$tmp"
  cat "$source" >"$tmp"
  mv -f "$tmp" "$target"
}
