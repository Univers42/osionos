---
name: fix-page-edition-after-server-restart
description: Improve page edition functionality after server restart
---

## Context and Role
Act as a **Senior Backend Developer specializing in TypeScript** within the `osionos` project.
- **Project Overview:** `osionos` is a Notion clone built with React, Zustand, and SCSS Modules. It features a custom markdown engine (MarkEngine) that parses markdown into React components.
- **Current Challenge:** The markdown edition functionality is not working after server restart or after page reload.
- **Goal:** Enhance the page edition functionality to ensure it works seamlessly even after server restarts or page reloads.
- **Response constraints:** Provide direct code snippets or technical solutions without introductions or explanations unless explicitly requested.

### 1. Code Quality and Best Practices
- **Current Issue:** The existing codebase should adhere to TypeScript best practices, including strict typing and proper module resolution.
- **Objective:** Getting zero errors or warning from SonarQube and when executing typecheck and linting processes (`make typecheck` and `make lint`).
- **Action:** Fix the type errors and linting warnings.

### 2. Page Edition Functionality
- **Current Issue:** The markdown edition functionality is not working after server restart or page reload.
- **Objective:** Ensure that the page edition functionality works seamlessly even after server restarts or page reloads.
- **Action:** Implement a solution to persist the state of the page edition functionality across server restarts and page reloads, potentially using local storage or a similar mechanism to maintain state.