#!/usr/bin/env bash
#
# One command that checks everything, and explains itself to someone who does not
# read code.
#
#   npm run check              # everything, against the deployed site  (~3 min)
#   npm run check -- --quick   # skip the two slow ones                 (~40 sec)
#   npm run check -- --local   # test the app running on localhost:3000
#
# WHY THIS EXISTS
# There were six separate commands, each printing developer shorthand, and knowing
# which to run and what a green line actually meant was knowledge that lived only in
# my head. That is fine until the person who needs the answer is a judge, a teammate,
# or me at 2am. So: every check runs from here, in order of how fast it fails, and
# every one is introduced as a QUESTION IN PLAIN ENGLISH with the answer underneath.
#
# The rule for the wording below: no jargon, no shorthand, and never a green tick
# without saying what it proves. A check nobody can interpret is not a check.

set -uo pipefail

QUICK=0
LOCAL=""
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --local) LOCAL="--local" ;;
    *) echo "Unknown option: $arg  (expected --quick or --local)" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$(mktemp -d)"
cd "$ROOT" || exit 2

TOTAL=7
[[ $QUICK -eq 1 ]] && TOTAL=5
N=0
FAILED=0
declare -a SUMMARY=()

W=70
line() { printf '  %s\n' "$(printf '─%.0s' $(seq 1 $W))"; }

# Wrap prose to the box width at a given indent, so no paragraph runs off a terminal.
say() {
  local indent="$1"; shift
  printf '%s\n' "$*" | fold -s -w $((W - ${#indent})) | sed "s/^/$indent/"
}

# step <question> <what-it-proves> <what-to-do-if-it-fails> <command…>
step() {
  local question="$1" proves="$2" remedy="$3"; shift 3
  N=$((N + 1))
  local log="$LOGS/$(printf '%02d' $N).log"

  printf '\n   %d/%d  %s\n' "$N" "$TOTAL" "$question"
  say "        " "$proves"

  local start elapsed status
  start=$SECONDS
  "$@" >"$log" 2>&1
  status=$?
  elapsed=$((SECONDS - start))

  if [[ $status -eq 0 ]]; then
    printf '        ✔ yes%*s%ds\n' 12 "" "$elapsed"
    SUMMARY+=("✔ $question")
  else
    FAILED=$((FAILED + 1))
    printf '        ✖ NO%*s%ds\n' 14 "" "$elapsed"
    SUMMARY+=("✖ $question")
    echo
    say "        " "What went wrong (the last few lines):"
    grep -Ev '^\s*$' "$log" | tail -12 | sed 's/^/          /'
    echo
    say "        " "What to do: $remedy"
    # Not wrapped — a path folded across two lines cannot be copied.
    printf '        Everything it printed:\n          %s\n' "$log"
  fi
}

# ── the run ──────────────────────────────────────────────────────────────────
echo
line
printf '   BRIGADE — does all of it actually work?\n'
line
if [[ $QUICK -eq 1 ]]; then
  say "   " "Five questions, asked in order, fastest first. Skipping the two slow \
ones because you passed --quick. About 40 seconds."
else
  say "   " "Seven questions, asked in order, fastest first. Each is answered by a \
program rather than by an opinion. About three minutes."
fi
say "   " "A ✔ means the thing underneath it was proved just now. Nothing here is \
taken on trust, including the documentation."
line

step "Is the SQL going to be rejected, or quietly do nothing?" \
     "Reads every database file looking for five specific mistakes that have already been made once each — including one that runs without error and simply has no effect." \
     "The report names the file, the line and the mistake. Fix it there." \
     npm run --silent sql:lint

step "Does the runway maths hold up?" \
     "69 small tests on the forecasting code by itself — no database, no internet. This is the part that predicts when a dish will run out." \
     "A failing test prints what it expected and what it got. Fix the code, not the test, unless the test is the thing that is wrong." \
     npm test --silent

step "Do the pieces of the app still fit together?" \
     "Checks every file agrees with every other about what data looks like. Catches the class of bug where one screen expects a price and another sends a name." \
     "Each error names a file and line. Usually a rename that was only half done." \
     npm run --silent typecheck

if [[ $QUICK -eq 0 ]]; then
  step "Does the database really enforce the rules we say it does?" \
       "Starts a throwaway database, applies every migration and patch twice over, then asks it 18 direct questions — can a cook change stock, is cost hidden from staff, can a chef fire another station's order. A comment claiming a rule is not evidence the rule exists." \
       "If a patch failed, the first error and its line are shown. If an assertion failed, the rule is not actually in force however it may read." \
       npm run --silent sql:check
fi

step "Is the live data sound?" \
     "Eleven checks against the real database: does the stock record book add up to what is on the shelf, is there enough trading history for the forecast to mean anything, and is any cost figure reachable by a diner." \
     "'Ledger equals projection' failing is the serious one — it means something changed stock without writing it down, and every number in the product is then suspect." \
     npm run --silent verify:data

step "Does every single feature work for a real person?" \
     "Signs in as the owner, the manager, two chefs, the pass, a server, the host and two diners, then orders food, cooks it, refuses to let the wrong person serve it, pays for it, books a table, joins the queue — over real HTTP, on the deployed site. Then puts the stock back." \
     "Each ✖ line says what was expected and what happened. Fix the first one first; later ones are often knock-on effects." \
     npm run --silent verify:features -- $LOCAL

if [[ $QUICK -eq 0 ]]; then
  step "Would it deploy right now?" \
       "Builds the site exactly the way the hosting provider will. Catches the failure where it runs fine on this laptop and breaks on deploy." \
       "The build prints the file it choked on. The usual cause is server-only code being imported into something that runs in the browser." \
       npm run --silent build
fi

# ── verdict ──────────────────────────────────────────────────────────────────
echo
line
for s in "${SUMMARY[@]}"; do printf '   %s\n' "$s"; done
line
if [[ $FAILED -eq 0 ]]; then
  printf '   ✔ ALL CLEAR — safe to demo.\n'
  if [[ $QUICK -eq 1 ]]; then
    say "   " "Note: --quick skipped the database rehearsal and the deploy build. \
Run the full check before submitting."
  else
    say "   " "Everything a judge can click has just been clicked by a script, on \
the deployed site, as the real people it was built for."
  fi
else
  printf '   ✖ %d of %d FAILED — read the ✖ blocks above.\n' "$FAILED" "$TOTAL"
  say "   " "The logs are kept in $LOGS until this machine restarts."
fi
line
echo

exit $((FAILED > 0 ? 1 : 0))
