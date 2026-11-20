# RH124 Virtual Lab — Red Hat System Administration I (RHEL 9.3) Simulator

An interactive, browser-based virtual lab environment for learning **Red Hat Enterprise Linux 9.3 (RH124)** and preparing for **RHCSA (EX200)** with unlimited practice—no external cloud VMs, lab hour limits, or API keys required.

## Features

- **16 Official RH124 (RHEL 9.3) Chapters**: Mapped to RHCSA (EX200) competency domains, covering:
  1. Get Started with Red Hat Enterprise Linux (`intro-navigate`)
  2. Access the Command Line (`cli-basics`)
  3. Manage Files from the Command Line (`files-manage`)
  4. Get Help in Red Hat Enterprise Linux (`help-man`)
  5. Create, View, and Edit Text Files (`text-vim`)
  6. Manage Local Users and Groups (`users-groups`)
  7. Control Access to Files (`permissions-access`)
  8. Monitor and Manage Linux Processes (`processes-monitor`)
  9. Control Services and Daemons (`services-systemd`)
  10. Configure and Secure SSH (`openssh-secure`)
  11. Analyze and Store Logs (`logging-journald`)
  12. Manage Networking (`network-nmcli`)
  13. Archive and Transfer Files (`archive-transfer`)
  14. Install and Update Software Packages (`software-dnf`)
  15. Access Linux File Systems (`filesystems-mount`)
  16. Analyze Servers and Get Support (`support-review`)
- **Side-by-Side Lesson & Lab Gating**: Complete each module's core concepts and concept check first to unlock the hands-on lab checkpoints alongside the live terminal.
- **3-Host Classroom Topology**: Practice multi-host workflows across `workstation.lab.example.com` (`172.25.250.9`), `servera.lab.example.com` (`172.25.250.10`), and `serverb.lab.example.com` (`172.25.250.11`) with interactive `ssh`, `scp`, `rsync`, and `ssh-copy-id`.
- **Classroom `lab` CLI & Real-Time Feedback**: Run `lab start <slug>`, `lab grade`, `lab finish`, and `lab list` inside the simulated shell, with interactive `vim`/`nano` editors, `man` pages, Tab autocomplete, and live coaching hints.
- **Timed Practical Trials & Live System Explorer**: Test exam readiness under timed scenarios and inspect live VFS permissions, users/groups, systemd units, processes, block devices, firewalld rules, and journald logs.

## Quick Start (Run Locally)

**Prerequisites:** [Node.js](https://nodejs.org/) v20 or newer

```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
npm install
npm run dev
```

Open **`http://localhost:3000`** in your browser. All progress is stored locally in your browser's `localStorage`.

## Build for Production

```bash
npm run build
npm run preview
```

## Scope: What's Simulated vs. Real RHEL

This project is a browser-based TypeScript simulation designed to help beginners build muscle memory across all **16 RH124 (RHEL 9.3)** chapters without VM hour limits:

- **Simulated locally in browser memory**: Virtual filesystem (`vfs`) with POSIX permissions/inodes, users/groups, `systemd` units, `nmcli` profiles, `journald`, `lsblk`/`mount`, `firewall-cmd`, `sos report`, and `lab start` / `lab grade`.
- **Simplified compared to a real RHEL kernel**:
  - `ssh servera` / `ssh serverb` switches the active session host and `scp`/`sftp` tracks remote files, rather than running three separate OS disks.
  - `vim` focuses on the 3-mode editing workflow (`Normal` → `i` Insert → `Esc` → `:wq`) rather than full Vi motions.
  - **RH134 / full RHCSA (EX200) topics** such as SELinux contexts, LVM partitioning, `cron`/systemd timers, containers (Podman), and boot recovery (`rd.break`) should still be practiced on a real RHEL 9 VM before taking the certification exam.

---

*Disclaimer: Independent educational study simulator created for RH124 / RHCSA practice. Not affiliated with, sponsored by, or endorsed by Red Hat, Inc.*
