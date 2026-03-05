#!/usr/bin/env bash
#
# OpenClaw live log dashboard with colored, exhibition-friendly output.
# - Tails the main OpenClaw log and gateway err log.
# - Highlights land/stamp/governance lines.
# - Shows inter-line delta and lines-per-second for a quick sense of pace.
#
# Usage:
#   ./scripts/monitor/openclaw-dash.sh
# Optional env:
#   LOG_DAY=2026-03-05   # pick a specific day; default is today

set -euo pipefail

DAY="${LOG_DAY:-$(date +%F)}"
MAIN_LOG="/tmp/openclaw/openclaw-${DAY}.log"
ERR_LOG="$HOME/logs/openclaw-gateway.err.log"

if [[ ! -f "$MAIN_LOG" ]]; then
  echo "Main log not found: $MAIN_LOG" >&2
fi

printf "Watching: %s\n         %s\n" "$MAIN_LOG" "$ERR_LOG"
printf "Legend: \033[38;5;82m[LAND]\033[0m land/stamp/governance | \033[38;5;214mWARN\033[0m | \033[38;5;196mERR\033[0m\n\n"

tail -n0 -F -q "$MAIN_LOG" "$ERR_LOG" 2>/dev/null | \
perl -MTime::HiRes=time -MPOSIX=strftime -ne '
  BEGIN {
    $prev = time;
    %c = (
      info  => "\e[38;5;45m",
      warn  => "\e[38;5;214m",
      err   => "\e[38;5;196m",
      land  => "\e[38;5;82m",
      ts    => "\e[38;5;250m",
      reset => "\e[0m",
    );
  }
  $now = time;
  $delta = $now - $prev;
  $rate = $delta > 0 ? 1 / $delta : 0;
  $prev = $now;
  chomp;
  next unless length;

  my $line = $_;
  my $cat = "info";
  $cat = "warn" if $line =~ /\b(warn|lane wait exceeded|timeout|slow)\b/i;
  $cat = "err"  if $line =~ /\b(error|failed|failure|cannot|panic|invalid)\b/i;
  my $is_land = ($line =~ /\b(land|parcel|acre|stamp|proposal|shortlist|governance)\b/i);

  my $color = $is_land ? $c{land} : $c{$cat};
  my $ts = strftime("%H:%M:%S", localtime($now));
  printf "%s%s%s | +%.3fs | %6.2f l/s | %s%s%s\n",
    $c{ts}, $ts, $is_land ? " [LAND]" : "      ",
    $delta, $rate,
    $color, $line, $c{reset};
'
