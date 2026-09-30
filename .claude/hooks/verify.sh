#!/usr/bin/env bash
# THE verification battery — the single source of truth for "green".
# CI runs this same file. Rules (proven in pati and juno): attempt EVERY
# step even after a failure and report them together; anything that
# cannot be verified is a FAIL, never a silent skip. The one third state,
# NOT RUN, names a step this machine is incapable of running and says
# where the real run is; it never appears in CI.
set -uo pipefail

# Resolve this file's directory BEFORE the cd: a relative $BASH_SOURCE
# would otherwise resolve against the wrong directory.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here/../.."

# Preconditions — a missing skeleton or missing deps is a FAIL.
if [ ! -f package.json ]; then
  echo "FAIL skeleton — no root package.json yet (ROADMAP walking skeleton not started)" >&2
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "FAIL deps — node_modules missing (run: npm ci)" >&2
  exit 1
fi

fail=0
results=()
log=""

# Seven wide so ok, FAIL and NOT RUN line up in the summary.
_result() { results+=("$(printf '%-7s %s' "$1" "$2")"); }

step() {
  local name="$1"
  shift
  # A mktemp template: BSD mktemp (macOS) refuses to run without one.
  [ -n "$log" ] || log="$(mktemp "${TMPDIR:-/tmp}/kefe-verify.XXXXXX")"
  # stdin closed: a step that reads stdin would swallow the caller's input
  # or block on a terminal. No step needs it.
  if "$@" >"$log" 2>&1 </dev/null; then
    _result ok "$name"
  else
    _result FAIL "$name"
    fail=1
    echo "--- $name ---" >&2
    tail -n 60 "$log" >&2
  fi
}

# Every tracked shell script keeps its exec bit. An editor's
# write-then-rename drops it, no content diff shows it, and the script
# just stops running. Reads the working tree, not the index, so the drop
# is caught before it is staged. A gate that cannot list files fails.
exec_bits() {
  local listed bad="" gone="" file
  listed="$(git -c core.quotePath=false ls-files -- '*.sh')" || {
    echo "cannot list tracked shell scripts (not a git checkout?)"
    return 1
  }
  [ -n "$listed" ] || { echo "no tracked shell scripts found at all"; return 1; }
  while IFS= read -r file; do
    if [ ! -e "$file" ]; then
      gone="$gone $file"
    elif [ ! -x "$file" ]; then
      bad="$bad $file"
    fi
  done <<<"$listed"
  [ -z "$gone" ] || echo "tracked shell scripts missing from the tree:$gone"
  [ -z "$bad" ] || {
    echo "tracked shell scripts without the exec bit:$bad"
    echo "fix with: chmod +x <path> && git update-index --chmod=+x <path>"
  }
  [ -z "$gone$bad" ]
}

# The @kefe/supabase suite talks to a real local Supabase stack, which is
# containers. Prints `run` or `not-run:<why>`.
supabase_tests_plan() {
  # CI starts the stack (.github/workflows/ci.yml), so there the suite
  # always runs and a missing stack is a defect in the run. `CI=false` and
  # `CI=0` are the idiom for turning CI behaviour OFF, hence the case.
  case "${CI:-}" in
    '' | false | 0) ;;
    *) echo run; return 0 ;;
  esac
  if ! command -v docker >/dev/null 2>&1; then
    echo "not-run:no docker on this machine"
    return 0
  fi
  # A cloud thread has /usr/bin/docker but no daemon behind it.
  # `timeout` is optional because macOS does not ship one.
  if command -v timeout >/dev/null 2>&1; then
    timeout 20 docker info >/dev/null 2>&1 || { echo "not-run:a docker binary, but no daemon answering it"; return 0; }
  else
    docker info >/dev/null 2>&1 || { echo "not-run:a docker binary, but no daemon answering it"; return 0; }
  fi
  # Docker works here: a stack that is down is this machine's to start
  # (`npx supabase start`), and a failing suite is a real FAIL.
  echo run
}

supabase_tests_step() {
  local name="tests (@kefe/supabase)" plan
  plan="$(supabase_tests_plan)"
  case "$plan" in
    run) step "$name" npm run test -w @kefe/supabase --if-present ;;
    not-run:*) _result "NOT RUN" "$name — CI's \`verify\` is the run (${plan#not-run:})" ;;
    # Nothing else may fall through to NOT RUN.
    *) _result FAIL "$name — unparseable plan [$plan]"; fail=1 ;;
  esac
}

# One test step per workspace, read from npm so a workspace added later
# cannot quietly lose its tests. The list is read into an array BEFORE
# any step runs, and an empty list is a FAIL: a battery that runs no
# tests must not say so in silence.
tests_steps() {
  local names ws
  local -a workspaces=()
  names="$(npm query .workspace --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const w of JSON.parse(s))process.stdout.write(w.name+"\n")})')" || names=""
  while IFS= read -r ws; do
    [ -n "$ws" ] && workspaces+=("$ws")
  done <<<"$names"
  if [ "${#workspaces[@]}" -eq 0 ]; then
    _result FAIL "tests — cannot list the workspaces (npm query .workspace)"
    fail=1
    return 0
  fi
  for ws in "${workspaces[@]}"; do
    case "$ws" in
      @kefe/supabase) supabase_tests_step ;;
      *) step "tests ($ws)" npm run test -w "$ws" --if-present ;;
    esac
  done
}

step "exec bits" exec_bits
step "typecheck" npm run typecheck --workspaces --if-present
step "lint"      npm run lint --workspaces --if-present
step "format"    npx prettier --check .
tests_steps
# Both web surfaces must build: the Expo web export and the admin SPA.
step "build (@kefe/mobile web)" npm run build:web -w @kefe/mobile
step "build (@kefe/admin)"      npm run build -w @kefe/admin
# iOS: no native project is checked in (Expo continuous native
# generation), so there is nothing here that only macOS can verify. The
# native binary is built at release time only; see CLAUDE.md "Deploy".

[ -z "$log" ] || rm -f "$log"
printf '%s\n' "${results[@]}"
exit $fail
