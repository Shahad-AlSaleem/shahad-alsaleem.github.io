---
title: "Bart — Writeup"
linkTitle: "Bart"
weight: 2
platform: "HTB"
name: "Bart"
os: "Windows"
difficulty: "Medium"
points: 30
release: "24 Feb 2018"
ip: "10.10.10.81"
tags: ["windows", "web", "brute-force"]
description: "Medium Windows box — vhost discovery, a chat app, and log poisoning to RCE."
---

{{< htb name="Bart" os="Windows" difficulty="Medium" points="30" release="24 Feb 2018" ip="10.10.10.81" >}}

Replace this with your Bart writeup. The front matter above is what renders the card on the grid pages.

## Reconnaissance

```bash
nmap -sCV 10.10.10.81
```
