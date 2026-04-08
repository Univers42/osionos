#!/bin/sh
set -e
mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1
