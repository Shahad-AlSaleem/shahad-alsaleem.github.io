---
title: "Blue — TryHackMe"
linkTitle: "Blue"
weight: 1
platform: "THM"
name: "Blue"
os: "Windows"
difficulty: "Easy"
release: "TryHackMe"
tags: ["windows", "eternalblue", "smb"]
description: "Beginner Windows room exploiting MS17-010 (EternalBlue)."
---

{{< htb name="Blue" os="Windows" difficulty="Easy" platform="THM" >}}

A beginner-friendly room exploiting **MS17-010 / EternalBlue**. Replace with your notes.

## Scanning

```bash
nmap -sCV --script vuln 10.10.x.x
```
