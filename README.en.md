# DSH media library

Browse, play and tag media in an existing DSH project. Right-click the project and choose **Use as media library**. Its Workspace directory is the only media root; no second path or restart is needed to designate it. Right-click again to open it or remove its designation. Removing a designation retains media files, tags and conversations.

Select a session in a designated project to open its media library next to chat. The video grid scans subdirectories through paged requests. Select a video for native browser playback; codec support belongs to the browser and no transcoding is provided. Create tag categories and tags, assign multiple tags in the preview, or ask the Agent to append tags. Untagged videos appear under Uncategorized.

Workspace owns project identity, title and path. Designations, tag categories and tags are stored under the actual DSH Home's `state/media-library/`. These are local business data, excluded from portable environment synchronization. Original files are never moved, copied, deleted or edited. No directory is enabled automatically. Directory changes invalidate further paging until refresh.

HTTP access requires an authenticated DSH owner Peer. Other principals, absolute paths, traversal, hidden components, Windows alternate streams/devices and descendant symlinks/junctions are refused. Linked descendants are refused even when their target is inside the project. Only supported media types are streamed, excluding HTML and SVG. Single byte ranges support seeking. Windows path checks are not an atomic sandbox against hostile concurrent ancestor replacement; use trusted user project directories.

This release targets the maintenance fork's declared Windows source Web environment. The original standalone OpenList reader and tests remain in source, but this UI connects only local projects and reads no cloud credentials.

Install a fixed Git commit through DSH's synchronizer or official plugin CLI. There are no installation lifecycle scripts or compiled runtime artifacts. Do not replace installed files or use development links. First-load activation follows the official Host lifecycle; project designation and tag edits never require a restart.

Run `npm test` for filesystem, persistence, auth, byte-range and failure regressions; `npm run build` checks runtime JavaScript syntax. Run `npm run test:client -- <current DSH source>` for production React components with synthetic API/controls. This is fixture evidence, not actual-page QA. Release additionally requires an independent DSH Home/port and actual-page checks without copied production credentials or chats.

[中文](README.md)
