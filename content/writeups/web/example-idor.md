---
title: "IDOR in account settings — Writeup"
linkTitle: "IDOR — account settings"
weight: 1
platform: "Web"
difficulty: "Medium"
tags: ["web", "idor", "access-control", "bug-bounty"]
description: "Insecure direct object reference exposing other users' account data."
---

> Template writeup — replace with your own finding. Web/bug-bounty entries don't
> use a box card; they render as a normal writeup with a TOC.

## Summary

A short, high-level description of the vulnerability, the affected endpoint, and
the impact. Keep target details responsible and within your disclosure scope.

## Steps to reproduce

```http
GET /api/v1/users/1042/settings HTTP/1.1
Host: target.example
Authorization: Bearer <your-token>
```

Changing the user ID returns another user's data — a classic broken access
control (IDOR) issue.

## Impact

Explain what an attacker could do, and map it to OWASP (e.g. A01: Broken Access
Control).

## Remediation

Enforce object-level authorization on every request; never trust client-supplied
identifiers.
