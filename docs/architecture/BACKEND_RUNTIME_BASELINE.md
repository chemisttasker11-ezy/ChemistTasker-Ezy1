# F02 - Supported backend runtime baseline

Status: implementation and compatibility verification in progress. This is not a production-readiness sign-off.

## Starting point

Repository main was fca354b62d49e95dced15d0d10d0d0cf87c9370e. Its requirements pin Django 5.1.8. No application source, serializer contract, model identity, Celery name or HTTP namespace is being rewritten in this runtime PR.

## Verified release selection (2026-10-06)

The official Django download page lists Django 5.2.17 as the current 5.2 LTS patch, with extended support through April 2028. It lists Django 5.1 as unsupported since 2025-12-03. The PyPI version-specific JSON confirms that 5.2.17 exists, is not yanked, and provides Python >=3.10 wheels. Its wheel was uploaded on 2026-08-04.

Primary sources:

- https://www.djangoproject.com/download/
- https://docs.djangoproject.com/en/5.2/releases/5.2.17/
- https://pypi.org/pypi/Django/5.2.17/json
- https://www.django-rest-framework.org/community/3.16-announcement/

Do not pin a prospective 5.2.18 merely because development release notes exist. Recheck the official release catalogue and actual PyPI availability at final acceptance; a newly released security patch must be reviewed before shipping.

The first compatibility change is intentionally Django==5.2.17 only. Existing DRF 3.16.0 already belongs to the series which officially supports Django 5.2. Other dependencies are audited, and any required patch changes must be justified and tested rather than performing an indiscriminate upgrade.

## Verification required

1. Install the pinned runtime and run pip check. Record the actual installed Django version.
2. Run all current backend, auth/admin/OTP, Channels/WebSocket, Celery, public-error, storage and financial suites.
3. Run migrations from empty PostgreSQL and the existing PostgreSQL concurrency contracts, then the F01 HTTP and race contracts once that PR is integrated.
4. Confirm makemigrations --check reports no uncommitted application migrations; never rewrite released migration files.
5. Audit the resolved installed dependency set against the Python Packaging Advisory Database through pinned pip-audit. Do not automatically apply --fix or introduce a blanket ignore list.
6. Any remaining advisory or dependency-collection failure is a reported blocker, not a green result.
7. Re-run exact-head integration gates after rebasing onto F01-merged main. No merge based solely on the current baseline's results.

## Boundaries

Daphne, Channels, Celery, the existing Django apps, shared-core package and native kiosk protocol remain. This PR creates no business model or table and does not change platform-billing or workforce/payroll authority. The separate billing-policy PR #139 is not incorporated here.

The F01 programme recovery document records the overall sequence. This independent runtime branch can be tested while F01 receives its deeper concurrency review, but final integration must test their combined tree.
