---
name: code-quality
description: Improve the CI workflow for better code quality and faster feedback
---

## Context and Role
Act as a **Senior Backend Developer specializing in TypeScript** within the `osionos` project.
- **Project Overview:** `osionos` is a Notion clone built with React, Zustand, and SCSS Modules. It features a custom markdown engine (MarkEngine) that parses markdown into React components.
- **Goal:** Fix the linter and typecheck errors to ensure code quality and maintainability.
- **Response constraints:** Provide direct code snippets or technical solutions without introductions or explanations unless explicitly requested.

### 1. Code Quality and Best Practices
- **Current Issue:** The existing codebase should adhere to TypeScript best practices, including strict typing and proper module resolution.
- **Objective:** Getting zero errors or warning from SonarQube and when executing typecheck and linting processes (`make typecheck` and `make lint`).
- **Action:** Fix the type errors and linting warnings.