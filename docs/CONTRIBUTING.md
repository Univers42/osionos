# Contributing to the Project

Welcome to the team! This document outlines our technical standards and workflows. We prioritize **code quality, architectural coherence, and collective growth** over rushing features.

---

## 🚀 Core Principles

Before writing your first line of code, keep these three rules in mind:

1.  **Critical Thinking:** Don't just pick the first solution you find. Analyze alternatives and understand the **trade-offs**.
2.  **Avoid Biases:** Don't use a tool just because it’s "cool" or it's the only one you know. We choose tools based on project objectives.
3.  **The "Lead Tech" Filter:** Major architectural changes or "critical changes" must be presented, debated, and voted on before implementation.

---

## 🛠️ Getting Started

### 1. Setup
```bash
git clone <repo-url>
cd project-folder
cp .env.example .env
make setup      # Initial installation
make dev        # Start development servers
```

### 2. Daily Commands
| Command | Action |
|---------|--------|
| `make test` | Run the **Reproducible Test Framework** |
| `make lint` | Check code style and quality |
| `make sonar` | Run local SonarQube analysis |

---

## 🌿 Git Workflow (The Golden Rules)

To keep our history clean and our `develop` branch stable, we follow these rules:

### Branching
* **Never touch `develop` or `main` directly.**
* Always create a feature branch from `develop`: `git checkout -b feat/my-feature-name`.
* **Keep it small:** A branch should ideally live no longer than 2-3 days.

### Commits
We use **Conventional Commits**. Your messages must be descriptive and follow this format:
`type(scope): Description starting with capital letter`

* `feature`: A new feature.
* `fix`: A bug fix.
* `docs`: Documentation changes.
* `refactor`: Code changes that neither fix a bug nor add a feature.
* `test`: Adding missing tests or correcting existing ones.

---

## 🧪 Testing Strategy

We use a **Reproducible Testing Framework**. This means tests must run exactly the same on your machine, your teammate's machine, and the CI/CD pipeline.

* **Lead Tech Role:** I provide and maintain the testing infrastructure (the framework).
* **Developer Role:** You are responsible for writing and running tests for every feature you create.
* **QA Integration:** Our QA colleagues will use this same framework to integrate end-to-end or automated tests.
* **Rule:** If a feature isn't tested, it isn't finished.

---

## 💎 Code Quality & Standards

### SonarQube
Every ticket must pass the **SonarQube** analysis with a **100% Quality Gate** status. This ensures:
* No new bugs or vulnerabilities.
* Proper code coverage.
* No "Code Smells" (messy code).

### Architecture & Patterns
* **Consistency:** Follow the established design patterns (e.g., Dependency Injection, Repository Pattern).
* **Data Structures:** Choose your data structures wisely (Map vs. Array). If a logic is complex, **document the "why"** in the code.
* **Audits:** As Lead Tech, I will periodically audit the code to ensure we are maintaining technical excellence.

---

## 🔄 Pull Requests (PR) & Review

The PR is our most important communication tool.

1.  **Peer Review:** Every PR requires at least one approval from a teammate.
2.  **Critical Changes:** If you modify the core architecture, database schema, or security logic, the **Lead Tech must review it**.
3.  **Checklist:** Before marking a PR as "Ready for Review," ensure:
    * [ ] It is rebased with `develop`.
    * [ ] All tests pass (`make test`).
    * [ ] SonarQube is green.
    * [ ] Documentation is updated.

---

## 📝 AI Transparency

We encourage using AI as a co-pilot, but we follow 42's transparency rules:
* **Disclose:** Mention in your PR if AI assisted you and for which specific parts.
* **Understand:** You must be able to explain every line of code you submit. **If you can't explain it, don't commit it.**

---

## 💡 Need Help?

If you are stuck or unsure about a technical decision:
1.  Check the `docs/` folder.
2.  Open a thread in the **#tech-debates** Discord channel.
3.  Bring it up during the Daily/Stand-up meeting.

**We are a team; we build excellence together!**

---
*Last updated: April 2026*