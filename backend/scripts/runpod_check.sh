#!/usr/bin/env bash
# Smoke-test a deployed backend image (RunPod or anywhere) end to end.
#
#   backend/scripts/runpod_check.sh <BASE_URL> [CASE_DIR]
#
# BASE_URL
#   RunPod load-balancing endpoint: https://<ENDPOINT_ID>.api.runpod.ai
#   RunPod pod (HTTP port 8000):    https://<POD_ID>-8000.proxy.runpod.net
#   Local docker:                   http://localhost:8000
# CASE_DIR  folder with t1c.nii.gz t1.nii.gz t2.nii.gz flair.nii.gz (default .demo/BRATS_001).
#           Leave it out and set SKIP_UPLOAD=1 to check only the health routes.
#
# Env:
#   RUNPOD_API_KEY  sent as "Authorization: Bearer ..." (needed for *.api.runpod.ai endpoints)
#   ORIGIN          also check CORS for this frontend origin, e.g. https://<deployment>.convex.site
#   TIMEOUT         seconds to wait for the job (default 900)
set -uo pipefail

BASE="${1:?usage: runpod_check.sh <BASE_URL> [CASE_DIR]}"; BASE="${BASE%/}"
CASE="${2:-.demo/BRATS_001}"
TIMEOUT="${TIMEOUT:-900}"
AUTH=(); [[ -n "${RUNPOD_API_KEY:-}" ]] && AUTH=(-H "Authorization: Bearer ${RUNPOD_API_KEY}")
fails=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; fails=$((fails + 1)); }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# GET with retries: serverless cold starts return 502/503/"no workers" for a while.
get() {
  local path="$1" out="$2" code
  for attempt in 1 2 3 4 5 6; do
    code=$(curl -sS -o "$out" -w '%{http_code}' --max-time 60 ${AUTH[@]+"${AUTH[@]}"} "$BASE$path" 2>/dev/null) || code=000
    [[ "$code" =~ ^(502|503|504|000)$ ]] || break
    echo "    $path → $code (cold start?), retry $attempt/6 in 10 s" >&2; sleep 10
  done
  echo "$code"
}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
echo "Backend check: $BASE"

echo "1. Health"
code=$(get /ping "$tmp/ping")
if [[ "$code" == 200 ]]; then ok "/ping 200 $(cat "$tmp/ping")"
else bad "/ping → $code. RunPod load balancing marks the worker unhealthy unless /ping returns 200 (image needs the /ping route, or set HEALTH_CHECK_PATH=/health on the endpoint)"; fi

code=$(get /health "$tmp/health")
if [[ "$code" == 200 ]] && [[ "$(json 'd.get("ok")' < "$tmp/health")" == True ]]; then
  ok "/health $(json 'd["model"]+" "+d["version"]' < "$tmp/health")"
else bad "/health → $code $(head -c 200 "$tmp/health")"; fi

if [[ -n "${ORIGIN:-}" ]]; then
  echo "2. CORS for $ORIGIN"
  allow=$(curl -sS -D - -o /dev/null --max-time 30 ${AUTH[@]+"${AUTH[@]}"} -X OPTIONS "$BASE/jobs" \
    -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')
  [[ "$allow" == "$ORIGIN" || "$allow" == "*" ]] && ok "allow-origin: $allow" \
    || bad "no Access-Control-Allow-Origin for $ORIGIN. Set ALLOWED_ORIGINS=$ORIGIN on the endpoint"
fi

if [[ "${SKIP_UPLOAD:-0}" == 1 ]]; then echo "Skipped upload (SKIP_UPLOAD=1)."; else
  echo "3. Upload $CASE"
  for s in t1c t1 t2 flair; do [[ -f "$CASE/$s.nii.gz" ]] || { bad "missing $CASE/$s.nii.gz"; exit 1; }; done
  size=$(du -ck "$CASE"/{t1c,t1,t2,flair}.nii.gz | tail -1 | cut -f1)
  (( size > 30000 )) && echo "    note: upload is ${size} KB; RunPod load balancing caps requests at 30 MB"
  code=$(curl -sS -o "$tmp/job" -w '%{http_code}' --max-time 300 ${AUTH[@]+"${AUTH[@]}"} -X POST "$BASE/jobs" \
    -F "t1c=@$CASE/t1c.nii.gz" -F "t1=@$CASE/t1.nii.gz" -F "t2=@$CASE/t2.nii.gz" -F "flair=@$CASE/flair.nii.gz") || code=000
  if [[ "$code" != 201 ]]; then bad "POST /jobs → $code $(head -c 300 "$tmp/job")"; else
    job=$(json 'd["jobId"]' < "$tmp/job"); ok "POST /jobs → $job"

    echo "4. Wait for the job (up to ${TIMEOUT}s)"
    start=$SECONDS; last=""
    while :; do
      code=$(get "/jobs/$job" "$tmp/status")
      if [[ "$code" == 404 ]]; then
        bad "GET /jobs/$job → 404. The request hit a different worker: jobs live on one worker's disk, so set the endpoint to max 1 worker (or use a network volume)"; break
      fi
      status=$(json 'd.get("status")' < "$tmp/status" 2>/dev/null || echo "?")
      now="$status $(json 'd.get("stage") or ""' < "$tmp/status" 2>/dev/null)"
      [[ "$now" != "$last" ]] && echo "    $(( SECONDS - start ))s: $now"; last="$now"
      [[ "$status" == done ]] && { ok "job done in $(( SECONDS - start ))s"; break; }
      [[ "$status" == failed ]] && { bad "job failed: $(cat "$tmp/status")"; break; }
      (( SECONDS - start > TIMEOUT )) && { bad "timed out after ${TIMEOUT}s (last: $now)"; break; }
      sleep 5
    done

    if [[ "${status:-}" == done ]]; then
      echo "5. Results"
      code=$(get "/jobs/$job/report" "$tmp/report")
      if [[ "$code" == 200 ]]; then
        ok "report: $(json '"tumor="+str(d["tumorDetected"])+" side="+str(d["side"])+" volumes="+str(d["volumesCm3"])+" certainty="+str(d.get("certainty"))' < "$tmp/report")"
      else bad "report → $code"; fi
      for f in model.glb seg.nii.gz flair.nii.gz; do
        code=$(get "/jobs/$job/$f" "$tmp/$f")
        bytes=$(wc -c < "$tmp/$f" | tr -d ' ')
        [[ "$code" == 200 && "$bytes" -gt 1000 ]] && ok "$f ${bytes} bytes" || bad "$f → $code (${bytes} bytes)"
      done
    fi
  fi
fi

echo; (( fails == 0 )) && echo "All checks passed." || echo "$fails check(s) failed."
exit $(( fails > 0 ))
