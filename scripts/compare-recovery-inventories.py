#!/usr/bin/env python3
"""Strict restored inventory comparison with one documented PostgreSQL cast spelling."""
import json
import sys

# pg_dump/restore can deparse an array-wide text cast as the same per-item casts.
# This exception matches this exact table/name and these exact complete predicates.
# No constraint is omitted and no arbitrary cast/whitespace normalization occurs.
CHECK_ID = ('attendance_provisionalattendance', 'provisional_decision_timestamp_matches_status')
EQUIVALENT_CHECKS = frozenset({"CHECK ((((decided_at IS NULL) AND ((status)::text = 'PENDING'::text)) OR ((decided_at IS NOT NULL) AND ((status)::text = ANY (ARRAY[('APPROVED'::character varying)::text, ('REJECTED'::character varying)::text])))))", "CHECK ((((decided_at IS NULL) AND ((status)::text = 'PENDING'::text)) OR ((decided_at IS NOT NULL) AND ((status)::text = ANY ((ARRAY['APPROVED'::character varying, 'REJECTED'::character varying])::text[])))))"})


def compare(before, after):
    before, after = dict(before), dict(after)
    left = before.pop('constraints')
    right = after.pop('constraints')
    if before != after:
        raise AssertionError('Restored data/schema/sequence inventory differs')
    if len(left) != len(right):
        raise AssertionError('Restored constraint count differs')
    for expected, actual in zip(left, right):
        if expected == actual:
            continue
        if (tuple(expected[:2]) == tuple(actual[:2]) == CHECK_ID
                and expected[2] in EQUIVALENT_CHECKS and actual[2] in EQUIVALENT_CHECKS):
            print('Equivalent PostgreSQL text-array deparse verified: ' + CHECK_ID[1])
            continue
        raise AssertionError('Restored constraint differs: ' + str(expected[:2]))


if __name__ == '__main__':
    with open(sys.argv[1]) as source:
        before = json.load(source)
    with open(sys.argv[2]) as source:
        after = json.load(source)
    compare(before, after)
