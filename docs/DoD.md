# 🏁 Definition of Done (DoD)

The **Definition of Done** is a standardized checklist that every ticket must satisfy before it can be moved to the **Done** column. This ensures that our code is stable, maintainable, and secure.

## 📋 The 7-Point Quality Checklist

### 1. Architectural Consistency & Patterns
* **Action:** Ensure the code follows the project's design patterns (e.g., Dependency Injection, specific folder structure).
* **Why:** We want the project to look like it was written by one person, not five different people. This makes it easier for anyone to jump in and help.

### 2. Reproducible Testing Framework
* **Action:** All new logic must have Unit Tests. Run `make test` and ensure **100% of tests pass**.
* **Why:** Tests are our safety net. They prove that your new feature works and that you haven't accidentally broken someone else's work.

### 3. SonarQube Quality Gate
* **Action:** Run the SonarQube analysis. The status must be **"Passed"** with no new Critical Bugs or Vulnerabilities.
* **Why:** It catches "Code Smells" and security risks that humans might miss during a quick look.

### 4. Linting & Formatting
* **Action:** Run `make lint`. There should be zero warnings or errors.
* **Why:** Clean code is readable code. Consistent indentation and naming conventions prevent "visual noise" during reviews.

### 5. Documentation (Code & Wiki)
* **Action:** If you created a new module, document it in the Wiki/README. If a function is complex, add a comment explaining the **logic/strategy** used.
* **Why:** Code tells you *what* it does; documentation tells you *why* it does it. This saves hours for your "future self."

### 6. Peer & Tech Lead Review
* **Action:** Your Pull Request (PR) must have at least **one approval** from a teammate. If it’s a **Critical Change** (Database, Security, Core Logic), it requires the **Lead Tech's** approval.
* **Why:** Collaborative review is the best way to share knowledge and catch edge-case errors.

### 7. Functional Validation (Acceptance Criteria)
* **Action:** Re-read the original ticket and verify that the feature does exactly what was requested.
* **Why:** To avoid "Scope Creep" (doing things not requested) and ensure we are delivering value to the user/client.

---

# 🚀 How to Close a Ticket (Example)

When you are ready to move a ticket from **In Progress** to **Done**, you must provide evidence. Copy and paste this template into your **Pull Request description** or your **Trello/Jira comment**.

## 📝 Ticket Closure Template

**Ticket:** [TASK-123] - User Authentication Logic
**Branch:** `feat/auth-logic`

### ✅ Checklist
- [x] **Architecture:** Followed the NestJS module pattern.
- [x] **Tests:** `make test` passed (Added 5 new unit tests).
- [x] **SonarQube:** Quality Gate passed (0 Bugs, 0 Vulnerabilities).
- [x] **Linting:** Clean, no formatting errors.
- [x] **Documentation:** Updated `auth.service.ts` comments and the API Wiki.
- [x] **Review:** Approved by @teammate_name.
- [x] **Validation:** Verified that users can log in and unauthorized users are blocked.

### 🤖 AI Disclosure
- [ ] No AI used.
- [x] AI assisted with: *Generating the boilerplate for the unit test suite.*