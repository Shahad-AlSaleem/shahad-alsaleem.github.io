---
title: "Jeeves — Writeup (w/o Metasploit)"
linkTitle: "Jeeves"
weight: 1
featured: true
platform: "HTB"
name: "Jeeves"
os: "Windows"
difficulty: "Medium"
points: 30
release: "11 Nov 2017"
ip: "10.10.10.63"
# Drop a real avatar at static/img/htb/jeeves.png and uncomment:
# avatar: "/img/htb/jeeves.png"
tags: ["windows", "web", "kdbx", "ads", "tokens"]
description: "Medium Windows box — a hidden Jetty service, a KeePass database, and a SeImpersonate privilege escalation."
---

{{< htb name="Jeeves" os="Windows" difficulty="Medium" points="30" release="11 Nov 2017" ip="10.10.10.63" >}}

> This is a **template** writeup so you can see the layout. Replace the prose,
> commands and screenshots with your own. Delete the box pages you don't need.

## Reconnaissance

Start with a full port scan to see what the host exposes. I use a quick script
that runs an initial sweep and then a deeper service scan on the open ports.

```bash
nmap -p- --min-rate 5000 -oN scans/all-ports.txt 10.10.10.63
nmap -p 80,135,445,50000 -sCV -oN scans/services.txt 10.10.10.63
```

The interesting part: four ports are open — HTTP on **80**, SMB on **445**, and
an unusual second web service on **50000**.

```
PORT      STATE SERVICE      VERSION
80/tcp    open  http         Microsoft IIS httpd 10.0
135/tcp   open  msrpc        Microsoft Windows RPC
445/tcp   open  microsoft-ds Windows 10 microsoft-ds
50000/tcp open  http         Jetty 9.4.z-SNAPSHOT
```

## Enumeration

### Port 80 — HTTP

The site on port 80 is a static "Ask Jeeves" search page. Submitting a query
returns an error image but no real functionality — a dead end on its own, but it
confirms the theme of the box.

### Port 50000 — Jetty

Port 50000 returns a 404 by default, so I fuzz for content. A directory brute
force quickly surfaces an administration console.

```bash
ffuf -u http://10.10.10.63:50000/FUZZ -w /usr/share/seclists/Discovery/Web-Content/common.txt
```

This reveals an exposed **Jenkins**-style console (`/askjeeves`) with no
authentication. An unauthenticated job console means we can run commands.

## Initial Foothold

Using the script console, we can execute Groovy that spawns a reverse shell back
to our listener. Set up the listener first:

```bash
nc -lvnp 443
```

Then run the payload from the console to get a shell as the service account.
Grab `user.txt` from the user's desktop.

{{< note tip >}}
Always note **which user** your shell runs as and what privileges it holds —
`whoami /priv` is the first thing to check on Windows.
{{< /note >}}

## Privilege Escalation

`whoami /priv` shows **SeImpersonatePrivilege** is enabled — the classic signal
for a potato-style token impersonation attack. Combined with the OS version,
this is the path to `NT AUTHORITY\SYSTEM`.

Before that, enumerating the user's files turns up a **KeePass** database:

```bash
dir /s /b C:\Users\kohsuke\Documents\*.kdbx
```

Crack it offline, extract the stored hashes, and use the recovered NTLM hash to
authenticate — then escalate via token impersonation to SYSTEM.

```bash
keepass2john CEH.kdbx > kdbx.hash
hashcat -m 13400 kdbx.hash rockyou.txt
```

The root flag isn't a plain file on the Administrator desktop — it's hidden in an
**alternate data stream**, a nice final twist:

```cmd
more < C:\Users\Administrator\Desktop\hm.txt:root.txt
```

## Lessons learned

- A 404 on the default path doesn't mean a service is empty — **fuzz it**.
- `whoami /priv` is the fastest privesc triage on Windows.
- Flags can hide in **alternate data streams**; check with `dir /R`.
