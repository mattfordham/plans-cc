# Refine plan-elaborate with research sub-agent

**ID:** 002
**Created:** 2026-01-28T09:45
**Type:** feature
**Status:** completed
**Completed:** 2026-01-28T10:15

## What
Refine the `/plan-elaborate` skill to spawn a research sub-agent for codebase exploration and web research, returning structured findings without polluting the main conversation context.

## Why
During elaboration, codebase exploration (Glob, Grep, Read) and web research (WebFetch, WebSearch) bloat the main conversation with raw data that gets summarized into the task file. This "context rot" reduces quality as the conversation progresses. Offloading research to a sub-agent keeps the main context clean — only the distilled findings come back.

## How
1. Update `skills/plan-elaborate/SKILL.md` to add Task tool to allowed-tools

2. Replace step 6 "Research the task" with sub-agent approach:
   ```
   6. **Spawn research sub-agent**
      Use the Task tool to spawn an Explore agent:
      - subagent_type: "Explore"
      - prompt: Include task description, project context summary, and what to find:
        - Relevant files for this task
        - Current implementation patterns
        - Suggested approach based on codebase conventions
      - Request structured return format:
        ```
        ## Relevant Files
        - `path/to/file.js` — Description of relevance

        ## Current Implementation
        Brief summary of how related functionality works

        ## Suggested Approach
        Recommended implementation steps based on codebase patterns

        ## Open Questions
        Anything unclear that needs user input
        ```
   ```

3. Add step 6b for processing results:
   ```
   6b. **Process research findings**
       - Parse the sub-agent's structured response
       - Use findings to pre-populate How section
       - Note any open questions for user discussion
   ```

4. Add fallback for when Task tool unavailable:
   ```
   Note: If Task tool is not available, fall back to direct research
   using Glob, Grep, and Read in the main conversation.
   ```

5. Keep interactive sections (Why, How confirmation, Verification) in main conversation

**Files to modify:**
- `skills/plan-elaborate/SKILL.md` — Add Task tool, restructure research step

## Verification
- [ ] `/plan-elaborate` spawns an Explore sub-agent for research
- [ ] Sub-agent returns structured findings (relevant files, patterns, suggested approach)
- [ ] Main conversation uses findings to fill Why/How/Verification sections
- [ ] Context in main conversation stays clean (no raw file dumps)
- [ ] Still works if Task tool is unavailable (fallback to direct research)

## Changes
- Updated `skills/plan-elaborate/SKILL.md`:
  - Added Task, WebFetch, WebSearch to allowed-tools
  - Replaced step 6 with "Spawn research sub-agent" using Explore agent
  - Added step 7 "Process research findings" to parse sub-agent response
  - Renumbered remaining steps (8-10)
  - Added fallback for when Task tool unavailable
  - Added edge cases for Task unavailable and incomplete findings

## Notes
- Inspired by gsd's multi-agent architecture (gsd-phase-researcher)
- GSD writes to RESEARCH.md files; we keep it simpler with direct return
- Execution stays in main conversation for now (transparency)
- Research findings get distilled into task file, raw exploration discarded
