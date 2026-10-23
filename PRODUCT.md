# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: React + TypeScript built with Vite into a static folder, served by the user's own rclone (`rclone rcd --rc-files ./dist`). Chosen because the app has many screens and stateful flows (config wizard, explorer, live jobs), and the output is plain static files that rclone can serve with no other server.

## Users

One person (the owner), on their own Linux PC, at least for now. They do not know rclone well and do not remember its commands. They want to drive everything rclone does from a browser tab instead of the terminal.

## Product Purpose

A local web panel for rclone. It replaces the command line for day-to-day use: connecting cloud accounts, browsing and organizing files in them, copying/syncing/moving between places, mounting clouds as folders, and following transfers. Success: the owner never has to open the terminal or the rclone docs to do something rclone can do.

## Positioning

Unlike rclone's own web GUI, this panel teaches as it goes: every step and every integration carries short, plain-Portuguese explanations of what an option means and what will happen, so a non-expert can use rclone safely.

## Operating Context

- Runs on localhost, served by the installed rclone (`/usr/bin/rclone`, v1.60.1, Ubuntu 24.04 package) through `rclone rcd`. Uses the user's existing rclone config (`~/.config/rclone/rclone.conf`).
- The page and the rc API share the same origin; access is protected by the rcd user/password.
- FUSE is available (`fusermount`, `fusermount3`), so mounts are possible.
- The owner already uses rclone for an Obsidian vault (there is an `rclone-obsidian.log` in their home folder).

## Capabilities and Constraints

- Scope: "all of rclone's functions", within what the v1.60.1 rc API offers. Available endpoints include: config (create/update/delete/get/listremotes/providers/password), operations (list, stat, about, size, mkdir, rmdir, rmdirs, purge, delete, deletefile, copyfile, movefile, copyurl, uploadfile, publiclink, cleanup, fsinfo), sync (copy, sync, move, bisync), mount (mount, unmount, unmountall, listmounts, types), vfs (list, refresh, forget, stats), jobs (list, status, stop, stopgroup), core (stats, transferred, bwlimit, version, gc, memstats), options (get/set), fscache.
- Not available in v1.60.1: `config/oauthstatus`, `serve/*`, `core/du`. OAuth sign-in during remote setup is handled by rclone opening the browser itself while the config call waits.
- Destructive operations (sync deleting files, purge, delete, move) must be explained and confirmed before running; a dry-run preview should be offered where rclone supports it.
- UI language: Brazilian Portuguese.

## Brand Commitments

- The owner chose the category standard on purpose (dark admin: sidebar, summary row, tables), to be executed at the craft level of Vercel and Linear. Convention is the commitment; no themed metaphor.
- The previous attempt (a Tauri desktop app) was rejected as confusing, slow to use, ugly in the details and generic. Precision in the details is the bar.

## Evidence on Hand

No content or assets beyond the user's real rclone setup. Do not invent remotes, files or usage numbers in the shipped UI.

## Product Principles

1. Explain before acting: every option and every risky action says, in plain words, what it does.
2. Never surprise with data loss: anything that deletes or overwrites is previewed and confirmed.
3. Everything rclone can do, reachable without the terminal.
4. Local and private: nothing leaves the machine except rclone's own traffic to the clouds.

## Accessibility & Inclusion

No specific requirement established; follow WCAG AA as the floor.
