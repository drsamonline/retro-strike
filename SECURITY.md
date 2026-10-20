# 🔐 Security Policy

[![Security](https://img.shields.io/badge/security-policy-38bdf8.svg?style=flat-square)](SECURITY.md)

## Supported versions

| Version | Supported |
|---|---|
| 1.1.x | ✅ |
| 1.0.x | ⚠️ critical fixes only |
| < 1.0 | ❌ |

## Threat model

RETRO STRIKE is a **fully offline, single-file** game. It:

- makes **no network requests** of any kind;
- loads **no external scripts, fonts or images**;
- uses **no `eval`, `new Function` or dynamic HTML injection**;
- stores data only in the browser's own `localStorage`.

That makes the attack surface very small. The most realistic issues are:

- **Denial of service** via a crafted `localStorage` value (e.g. a malformed save
  that crashes the render loop). Settings and JSON loads are guarded and clamped,
  and the frame loop is wrapped in a guard — but please report anything that
  still locks the page up.
- **XSS** if a future change ever renders stored or user data as markup. It
  currently never does; treat any introduction of `innerHTML` as a regression.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead use
GitHub's [private vulnerability reporting](security/advisories/new) or
contact the maintainer directly. Include:

- a description and impact,
- steps to reproduce (ideally a minimal HTML or a `localStorage` payload),
- affected version.

We aim to acknowledge reports within a few days.
