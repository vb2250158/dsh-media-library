# Changelog

## 0.1.3

- Restore the required `id` for the session-header list slot; `key` is reserved for keyed slots. Retain project-menu navigation through the main panel.

## 0.1.2

- Open Workspace media actions in the project panel even when a Session is mounted without a visible right Sidebar. Register the session-header contribution with the public slot key.

## 0.1.1

- License the original plugin code and configuration under MIT, include the license in package files, and retain the npm private marker. External dependencies keep their own licenses.

## Unreleased

- Show a recursive video grid next to sessions in designated workspaces, with category filters and multiple tags per video.
- Let users create tag categories and let Agents append labels without replacing existing tags.
- Sort videos by modification time, name, or file size.
- Choose media folders inside or outside the workspace and keep the library settings and tags in the workspace.
- Display video-frame covers and manage folders and tag categories in settings.

## 0.1.0

- Designate existing Workspace projects through their context menu and open a project media panel without entering another path.
- Browse bounded directory pages, play media through authenticated byte-range reads, and persist tags separately from original files.
- Preserve project conversations, media and labels when removing a designation; clean up streams and UI registrations on unload.
- Keep filesystem boundaries, owner authentication, persistence failures and directory changes covered by focused regressions.
