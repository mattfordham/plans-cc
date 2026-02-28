---
name: plan-brainstorm
disable-model-invocation: true
argument-hint: "[topic]"
allowed-tools:
  - Read
  - Write
  - Edit
  - AskUserQuestion
description: Explore ideas through guided discussion, capture as synthesized documents
---

# plan-brainstorm

Facilitate exploratory idea discussions and capture them as synthesized documents. This skill enters an interactive exploration mode where Claude asks probing questions, challenges assumptions, and explores alternatives with you. When ready, say "capture" to synthesize the discussion into a saved document.

## Arguments

- `$ARGUMENTS`: Optional topic to explore (e.g., "authentication redesign", "new pricing model")

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Create ideas directory if needed**
   - Check if `.plans/ideas/` exists
   - If not, create it

3. **Get the topic**
   - If `$ARGUMENTS` provided, use it as the topic
   - If no arguments, ask: "What topic would you like to explore?"

4. **Enter exploration mode**
   - Acknowledge the topic
   - Set the expectation: "When you're ready to save, just say 'capture this' or 'save this'"
   - Begin with an open-ended question about the topic

## During the Discussion

Use `AskUserQuestion` for all exploration prompts. Never output questions as plain text.

**Exploration style:**
- Stay curious, not solutionist — focus on understanding the problem space before converging
- Challenge assumptions constructively
- Explore multiple angles: technical, user experience, business, maintenance
- Periodically summarize key points discussed (every 3-4 exchanges)
- Encourage tangents — sometimes the best insights come from unexpected directions

**Example prompts using AskUserQuestion:**

Opening exploration:
```
question: "What's driving this? What problem are you trying to solve?"
header: "Context"
options:
  - label: "User pain point"
    description: "Users are struggling with something"
  - label: "Technical limitation"
    description: "Current system can't do something"
  - label: "Business opportunity"
    description: "New capability or market"
  - label: "Tech debt"
    description: "Existing code needs improvement"
```

Probing deeper:
```
question: "What would happen if we didn't do this at all?"
header: "Stakes"
options:
  - label: "Users would leave"
    description: "Critical for retention"
  - label: "Slower growth"
    description: "Nice to have, not urgent"
  - label: "Tech debt compounds"
    description: "Gets harder over time"
  - label: "Competitors win"
    description: "Market pressure"
```

Challenging assumptions:
```
question: "What if we did the opposite of what you're proposing?"
header: "Flip it"
options:
  - label: "That's actually interesting..."
    description: "Let me think about that"
  - label: "Wouldn't work because..."
    description: "I'll explain the constraint"
  - label: "We tried that"
    description: "There's history here"
```

Exploring approaches:
```
question: "Which direction feels most promising?"
header: "Direction"
options:
  - label: "[Approach A]"
    description: "[Brief tradeoff]"
  - label: "[Approach B]"
    description: "[Brief tradeoff]"
  - label: "Something else"
    description: "I have a different idea"
```

Ready to wrap up:
```
question: "Are you ready to capture this, or explore further?"
header: "Next"
options:
  - label: "Capture it"
    description: "Save what we've discussed"
  - label: "Keep exploring"
    description: "There's more to uncover"
  - label: "Pivot topics"
    description: "I want to explore something related"
```

## Capture Triggers

Recognize these phrases as signals to capture:
- "capture this"
- "save this"
- "let's capture"
- "save the brainstorm"
- "capture it"
- "done brainstorming"
- "that's enough"

## On Capture

1. **Read config.json**
   - Get `idea_next_id` value (default to 1 if not present)
   - Format as 3-digit zero-padded string (e.g., 1 → "001")

2. **Generate filename**
   - Slugify the topic:
     - Lowercase
     - Replace spaces with hyphens
     - Remove special characters (keep alphanumeric and hyphens)
     - Truncate to max 40 characters (at word boundary if possible)
   - Format: `NNN-slug.md` (e.g., `001-authentication-redesign.md`)

3. **Synthesize the discussion**
   Write to `.plans/ideas/NNN-slug.md`:
   ```markdown
   # [Topic Title]

   **ID:** [NNN]
   **Created:** [YYYY-MM-DDTHH:MM]

   ## Context
   [What prompted this exploration — the original framing or problem]

   ## Key Insights
   - [Insight 1 — the most important realizations from the discussion]
   - [Insight 2]
   - [...]

   ## Decisions & Conclusions
   [Any firm decisions reached, or "None yet" if purely exploratory]

   ## Open Questions
   - [Question 1 — unresolved items worth revisiting]
   - [Question 2]

   ## Notes
   [Additional context, references, tangents worth preserving]
   ```

4. **Update config.json**
   - Increment `idea_next_id`
   - Write updated config

5. **Display confirmation**
   ```
   Captured idea #NNN: [Topic Title]
   File: .plans/ideas/NNN-slug.md

   To create tasks from this, run: /plan-import .plans/ideas/NNN-slug.md
   ```

## Edge Cases

- **No topic provided**: Ask the user what they'd like to explore
- **ideas/ directory doesn't exist**: Create it automatically
- **idea_next_id missing from config**: Default to 1, then scan `.plans/ideas/` for highest existing ID and use max + 1
- **User says "capture" immediately**: Politely note there's nothing to capture yet and continue exploring
- **User changes topic mid-discussion**: Roll with it — the capture will reflect where the discussion actually went
- **Very long discussion**: Focus the synthesis on the most valuable insights; be selective, not exhaustive
