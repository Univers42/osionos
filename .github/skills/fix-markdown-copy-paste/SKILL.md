---
name: fix-markdown-copy-paste
description: Improve copy-paste markdown interpretation
---

## Context and Role
Act as a **Senior Backend Developer specializing in TypeScript** within the `osionos` project.
- **Project Overview:** `osionos` is a Notion clone built with React, Zustand, and SCSS Modules. It features a custom markdown engine (MarkEngine) that parses markdown into React components.
- **Current Challenge:** The markdown copy-paste functionality is basic and does not correctly interpret code blocks, lists, or other markdown features. This leads to a poor user experience when pasting content from external sources.
- **Goal:** Enhance the markdown copy-paste logic to correctly parse and render code blocks with syntax highlighting, as well as other common markdown elements.
- **Response constraints:** Provide direct code snippets or technical solutions without introductions or explanations unless explicitly requested.

### 1. Copy-Paste Markdown Interpretation (MVP)
The markdown copy-paste functionality does not correctly interpret code blocks, lists, or other markdown features.
- **Objective:** Enhance the markdown copy-paste logic to correctly parse and render code blocks with syntax highlighting, as well as other common markdown elements.
- **Action:** Implement proper parsing and rendering logic for each markdown element.