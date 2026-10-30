# Bug report — <title>

**Program:** <program>
**Asset:** <asset and tier>
**Submitted:** <date>
**Reporter:** l27sen

---

## Title

> Asset + vulnerability + impact. Specific.
> Bad: "IDOR vulnerability"
> Good: "Authenticated IDOR in `/api/v1/employees/{id}` allows one tenant to read
> another tenant's employee PII including salary data"

## Summary

<Two sentences. What it is. What it affects.>

## Vulnerability type

<e.g. Broken access control — horizontal (cross-tenant) IDOR>

## Severity (my assessment)

<CVSS or the program's own band, plus one line of justification>

## Scope

| Field | Value |
|---|---|
| URL | |
| Endpoint | |
| Parameter | |
| Method | |
| Environment | |
| Account used | |

## Steps to reproduce

> Numbered. Each step shows the request and the response. A reviewer with no context
> must be able to follow this from a clean session.

**Prerequisites:**

1. Log in as <account A, tenant 1>
2. Send the following request:

```http
GET /api/v1/employees/<victim-id> HTTP/1.1
Host: <host>
Cookie: <session>
```

3. Observe the response:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{ ...redacted but clearly showing the victim's data... }
```

4. <Next step>

## Evidence

> Screenshots, video, raw request/response pairs, timestamps.
> A screen recording of the full exploit is strongly preferred — many programs pay
> bonuses for it. All evidence must live inside this report.

- `evidence-01.png` — <description>
- `poc-recording.mp4` — <description>
- `request-response.txt` — <description>

**Timestamps (UTC):** <list the exact times the requests were made>
**Accounts used:** <list every account, with identifiers>

## Impact

> Concrete business risk, in the vendor's language. Not a CVSS recital.
> For access control: how many records were reachable, and which sensitive fields
> they contained. Vague impact means low severity.

## Remediation

1.
2.

## Disclosure intent

<Whether you intend to publish, and when. Follow the program's policy.>

---

## Pre-submission checklist

- [ ] Reproduces from a clean session in under five steps
- [ ] Impact demonstrated, not asserted
- [ ] Not on the program's unpaid list
- [ ] Environment is in scope
- [ ] Not a duplicate
- [ ] Timestamps present
- [ ] Account IDs present
- [ ] Video recorded
- [ ] PII redacted but context preserved
- [ ] Evidence contained in the report
- [ ] Title names the asset, the bug and the impact
