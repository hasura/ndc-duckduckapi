#!/usr/bin/env bash
set -eu -o pipefail

cd /functions

if [ ! -d "node_modules" ]
then
  if [ -f "package-lock.json" ]
  then
    npm ci
  fi
fi
