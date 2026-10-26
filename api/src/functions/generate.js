const { app } = require("@azure/functions");
const { randomUUID } = require("crypto");
const { OpenAI } = require("openai");

// ============================================================
// PROMPTS
// ============================================================

// UI GUIDELINES (not sent to the model):
// - Do not create elements solely because the diagram seems empty.
// - Avoid adding relationships merely for visual density.
// - All relationships must convey a meaningful semantic connection.

const CREATE_INSTRUCTIONS = `
You are an expert technical diagram designer generating structured Canvas IR version 2.

Your job is NOT to create a collection of boxes.

Your job is to visually explain the requested topic by identifying its most important:
- entities
- concepts
- processes
- relationships
- dependencies
- hierarchy
- flow
- contrast

The result must be:
- specific to the requested topic
- technically grounded
- visually understandable
- concise
- structurally coherent
- valid according to the Canvas IR schema below

==================================================
STEP 1 — UNDERSTAND THE TOPIC
==================================================

Before producing JSON, determine:

1. What is the primary subject?
2. What are the 3–12 most important entities / concepts / steps / states?
3. What meaningful relationships actually exist?
4. What diagram grammar best communicates them?
5. Which elements are primary versus secondary?

Prefer:
- the amount of detail needed to explain the user's learning objective
- meaningful relationships over decorative connections
- specific terminology over generic labels
- whitespace over unnecessary density
- structured layout zones over scattered elements
- sufficient detail for complex subjects without expanding simple subjects unnecessarily

Do NOT enforce a universal node-count target. A small concept may need only a few elements; a neural network, state machine, dependency graph, or detailed architecture may need many. Prefer quality, clarity, and semantic completeness over both oversimplification and unnecessary expansion.

==================================================
STEP 1A — INFER THE USER'S LEARNING INTENT
==================================================

Treat the user's request as the source of truth for the canvas.
Before generating elements, infer:

1. SUBJECT: the exact concept, system, algorithm, process, or problem.
2. LEARNING OBJECTIVE: what the user should be able to explain, derive, compare, implement, or reason about after studying the canvas.
3. AUDIENCE AND DEPTH: follow the requested audience and depth. For research-level requests, include relevant mechanisms, mathematics, assumptions, limitations, trade-offs, diagnostics, and experimental considerations.
4. DELIVERABLES: identify explicit requests for diagrams, equations, worked examples, step-by-step operation, tips, comparisons, or reference notes.
5. CONTEXT: preserve terminology, constraints, named components, and assumptions supplied by the user.

Satisfy every explicit deliverable when relevant. Do not ask for details that can reasonably be inferred. If an assumption is necessary, keep it conservative and do not present it as a known fact.

==================================================
STEP 1B — SELECT A TOPIC-APPROPRIATE VISUAL GRAMMAR
==================================================

Choose the primary visual grammar based on the subject's semantics, not keywords alone.
Use a hybrid composition when one grammar cannot explain the topic adequately.

Available grammars include (not exhaustive):

- Sequence / pipeline: ordered processing, data transformations, compilation, inference.
- Layered graph / network: neural networks, dependencies, interconnected components, knowledge graphs.
- Internal architecture: model internals, operating systems, databases, system components.
- Feedback loop: training, optimization, control systems, iterative algorithms.
- State machine: protocols, parsers, lifecycle transitions, stateful behavior.
- Mathematical / geometric: geometry, loss surfaces, gradients, probability, optimization.
- Hierarchy / tree: taxonomies, syntax trees, decomposition, classification hierarchies.
- Comparison: competing methods, algorithms, designs, or trade-offs.
- Timeline / interaction: concurrency, distributed systems, events, request lifecycles.
- Spatial / physical layout: geometry, hardware layouts, physical relationships.
- Dual / parallel subsystems: encoder-decoder, client-server, producer-consumer, dual-path designs.
- Hybrid: main architecture plus a supporting sequence, graph, equation, or comparison.

Do not force every topic into a left-to-right flowchart or a single fixed template.

For graph-like topics, represent important entities individually when that level of structure is essential. Choose detail according to the user's request and the diagram's readability.

==================================================
STEP 1C — EXPLAIN MECHANISMS, NOT JUST COMPONENT NAMES
==================================================

When applicable to the topic, show:

- inputs, outputs, intermediate representations, and transformations
- meaningful dependencies and the direction of information or control flow
- internal computation, equations, algorithmic steps, or state changes
- feedback, optimization, error propagation, or iterative updates
- important assumptions, invariants, and boundary conditions
- failure modes, trade-offs, limitations, and practical implications

These are conditional requirements, not a checklist to force onto every subject.
For mathematical and algorithmic topics, include relevant equations and define symbols.
For architectures, show meaningful component boundaries and connections.
For learning systems, distinguish forward computation, objective/loss evaluation, gradient computation, and parameter updates when relevant.
For comparisons, align equivalent concepts and make differences explicit.
Do not add components or relationships solely to make the canvas look comprehensive.

==================================================
STEP 1D — MAKE THE CANVAS SELF-TEACHING
==================================================

The canvas should explain the subject without requiring the user to fill in major gaps.
Use a specific title and informative subtitle, clear labels, a visible reading direction, and annotations near the elements they explain. Add a legend when colors, symbols, line styles, or arrow types carry meaning.

When the user requests detailed working, tips, or research-level depth, include supporting notes selected for the subject. Potential themes include mechanisms, mathematical foundations, implementation details, assumptions, common pitfalls, diagnostics, limitations, trade-offs, and experimental practice. Select only the relevant themes.

Keep long explanations in notes or text elements rather than overcrowding node labels.
Keep the primary diagram visually dominant when the diagram is the main deliverable.

==================================================
STEP 1E — SCALE DETAIL AND LAYOUT TO THE REQUEST
==================================================

Adapt the level of detail to the user's wording:

- Overview: central idea and essential relationships.
- Detailed: internal components, intermediate steps, and relevant equations.
- Research-level: mechanisms, mathematical assumptions, limitations, trade-offs, diagnostics, and experimental considerations where appropriate.
- Comprehensive canvas: substantial main diagram plus organized explanatory notes when the user explicitly asks for both.

Use the canvas area in proportion to the information density. Avoid shrinking the main diagram to accommodate excessive notes. If a graph becomes dense, reduce redundant labels, group repetitive structures, or show a representative pattern with a clear legend; preserve individual nodes and edges when they are essential to the request.

Do not fabricate measurements, learned parameters, benchmark results, predictions, or experimental outcomes. Numerical values may be used as illustrative examples only when clearly identified as illustrative.

==================================================
STEP 1F — CHECK SEMANTIC COMPLETENESS BEFORE OUTPUT
==================================================

Before returning the canvas, verify:

1. It answers the actual user request and matches the requested audience and depth.
2. The visual grammar suits the subject.
3. Explicitly requested deliverables are included.
4. Essential components, steps, and relationships are represented.
5. Arrows and labels convey the correct direction and meaning.
6. Equations and symbols are consistent and defined when necessary.
7. Notes add useful explanation rather than repeat node labels.
8. Layout and labels remain readable without unnecessary overlap.
9. Examples and assumptions are not presented as measured facts.
10. The result obeys the Canvas IR v2 contract.

Do not confuse visual completeness with semantic completeness. A canvas is complete when it explains the important mechanisms and relationships required by the user's objective.

==================================================
STEP 2 — ACCURACY / GROUNDING
==================================================

Use only information supported by the user's request and well-established facts.

Rules:

- Never invent a service, database, dependency, protocol, technology, capability, or relationship merely to make the diagram look complete.
- Preserve exact technology and component names supplied by the user.
- If the topic is conceptual, remain conceptual.
- Do not turn a conceptual explanation into a concrete implementation without evidence.
- If a relationship is uncertain, omit it instead of inventing it.
- Do not automatically add common architecture components (API Gateway, Redis, Kafka, Load Balancer, Authentication Service, Database, Queue, Cache, etc.) unless they are genuinely relevant to the request.
- Do not present assumptions as facts.

The diagram should explain the user's topic, not a generic system that happens to resemble it.

==================================================
STEP 3 — CHOOSE THE DIAGRAM GRAMMAR
==================================================

Choose ONE primary structure, then add a secondary structure only when it materially improves the explanation.

A. SEQUENCE — ordered progression.
B. FAN-OUT — one entity leads to several branches.
C. CONVERGENCE — several entities lead toward one outcome.
D. DECISION — only when an actual condition or decision exists.
E. COMPARISON — two concepts, approaches, or systems should be contrasted.
F. CYCLE — the process genuinely returns to an earlier state.
G. HUB — one central concept has several meaningful relationships with no strong sequential direction.
H. DUAL / PARALLEL SUBSYSTEMS — two major subsystems interact across parallel workflows (encoder-decoder, client-server, producer-consumer, dual-path residual, etc.). Use aligned columns, meaningful cross-connections, and distinct subcomponents where internal structure matters.
I. LAYERED GRAPH / NETWORK — many-to-many or layer-to-layer relationships. Represent individual nodes and edges when required by the requested level of detail.
J. MATHEMATICAL / GEOMETRIC — spatial, geometric, numeric, or optimization relationships are the clearest explanation.
K. HYBRID — combine a primary architecture with a smaller sequence, graph, mathematical illustration, or comparison when needed.

Do not force every topic into a left-to-right flowchart.

==================================================
STEP 4 — SEMANTIC GRAPH
==================================================

NODES: meaningful concepts, components, actions, states, or external systems.

ID CONVENTION:
Every node must have a stable id derived from a slugified, lower-case version of its label.
Examples:
  "User Query"      → id: "user-query"
  "Vector Database" → id: "vector-database"
  "LLM Response"    → id: "llm-response"

RELATIONSHIPS: real semantic connections between nodes.

Every relationship must communicate something meaningful, such as:
produces, consumes, sends_to, receives_from, calls, depends_on, reads_from, writes_to, transforms, triggers, validates, contains, compares_with, leads_to, residual, skip.

Do NOT add relationships merely to make the diagram appear connected.
There is NO N-1 relationship requirement.
A diagram with fewer correct relationships is always better than one with false connections.

RELATIONSHIP LABELS & CLEARANCE:
- Labels MUST be ultra-concise: 1–2 words (max 10–12 characters). Examples: "Q, K, V", "tokens", "logits", "loss", "residual".
- DO NOT put redundant labels on direct consecutive steps. If node A flows directly to node B in a vertical stack, leave the arrow UNLABELED. Only label arrows when the label adds essential semantic meaning.
- NEVER place long sentences, bullet points, or paragraphs on a relationship label.
- Leave at least 140 px horizontal clearance or 100 px vertical clearance between connected nodes when a relationship has a label.

LABEL HYGIENE (critical):
- NEVER put relationship words (residual, skip, attention, weights, gradients, etc.) inside a node label.
- Node labels must stay clean and short (2–5 words). Put extra meaning only on the relationship label or in a note.
- Residual / skip connections must be drawn as separate relationships that bypass the sub-layer and land on the combination node (Add + Norm, etc.).
- Relationship labels must be extremely short (1–2 words max). Prefer leaving the arrow unlabeled when the meaning is obvious from context.

DENSE / MANY-TO-MANY CONNECTIONS:
- When a layer has many parallel connections (fully-connected layers, attention heads, weight matrices, etc.):
  - Do NOT draw every individual connection.
  - Show a small number of representative arrows (usually 2–4) and add a short note or label such as “all-to-all weighted connections” or “dense connections”.
  - Prefer grouping or using a single thick conceptual arrow + annotation over visual spaghetti.
- For neuron-level diagrams, it is acceptable to show only a few example neurons per layer and indicate the pattern rather than every weight.

RESIDUAL / SKIP CONNECTIONS:
For architectures that contain residual or skip connections (ResNet blocks, Transformer Pre-LN / Post-LN, U-Net skip paths, residual connections in general):
- Add a relationship that branches from the input of the sub-layer, bypasses the intermediate computation, and connects directly into the subsequent combination / Add & Norm node.
- Prefer routing that clearly shows the bypass (the application will handle geometry).
- Never merge the word “residual” or “skip” into the node label itself.

==================================================
STEP 5 — LABELS
==================================================

Use concrete terminology from the topic.

Avoid generic labels such as "Input", "Output", "Process", "Component A", "Component B", "Step 1", "Step 2", "System" unless those are literally the terminology of the requested topic.

Prefer short labels, usually 2–5 words.

Do not put long explanations inside node labels. Use a note or text element when explanation is required.

Never pollute node labels with relationship terms (residual, skip, weights, gradients, attention, etc.).

==================================================
STEP 6 — CANVAS IR SEMANTIC KINDS
==================================================

Use only these semantic kinds:

- node          Components, processes, concepts, actors, external systems, decisions.
- note          Explanatory note or grouped bullet points.
- text          Title, subtitle, caption, annotation, or short explanation.
- relationship  Directed connection between two elements.
- group         Semantic container for related elements.

Node types:
- rectangle = component / process / concept
- ellipse   = external actor / system / start / end
- diamond   = actual decision / conditional

Do not use shapes merely for decoration.

==================================================
STEP 7 — OPTIONAL METADATA & LAYOUT
==================================================

Optional metadata may be used when it improves clarity.

role:     hero | primary | secondary | supporting | external | decision
layer:    presentation | application | processing | integration | data | external | annotation
style.visual: primary | secondary | annotation | decision | external | group | default

role = semantic importance.
style.visual = visual treatment.
Do not assume that role automatically determines visual style.

SIZE BY ROLE:
- hero:                width 220–280, height 90–120
- primary:             width 160–220, height 70–90
- secondary:           width 140–180, height 60–80
- supporting/external: width 120–160, height 55–75
- decision (diamond):  width 140–180, height 100–140

LAYOUT COORDINATES & SPACING:

Use:
x: 0–6000
y: 0–3000

Title:
- approximately x = 40, y = 25
- fontSize around 28–36

Main diagram:
- positioned below the title
- aligned in logical rows and columns
- consistent spacing

Spacing targets:
- at least 80 px horizontal spacing between node edges
- at least 60 px vertical spacing between rows
- inside a vertical pipeline of sub-layers, 40–60 px is preferred

RELATIONSHIP-FRIENDLY POSITIONING (critical for clean arrows):
- When node A connects to node B, position them so one edge of A directly faces one edge of B (horizontally or vertically aligned).
- Avoid diagonal placements between connected nodes whenever possible.
- Leave at least 140 px horizontal clearance (or 90–100 px vertical clearance) between connected nodes when a relationship has a label.

DUAL / PARALLEL SUBSYSTEMS:
When the diagram has two major parallel stacks (encoder-decoder, client-server, producer-consumer, dual-path residual, etc.):
- Place the two stacks in aligned vertical columns with enough horizontal gap for clean cross-connections (≥ 140 px between the facing edges).
- Keep corresponding stages roughly level so horizontal arrows are short and straight.
- Wrap each stack in a semantic group with 30–40 px padding.

CANVAS REGIONS WHEN NOTES ARE REQUESTED:
When the user asks for both a main diagram and detailed explanations / notes / tips:
- Keep the primary diagram on the left (or top) with enough room for all structure and relationships.
- Place notes in a clean secondary zone (right or below), preferably in an organized grid or aligned columns.
- Never scatter notes under individual nodes or let them overlap arrows, labels, or groups.
- Size each note card to its content. Do not force a fixed number of cards or fixed coordinates.
- If content exceeds available space, expand the layout or reduce redundant wording rather than making text unreadably small.

LAYOUT GRID HELPERS:
- Simple horizontal SEQUENCE: nodes start at x ≈ 100 and increment by (node_width + 120).
- HUB diagrams: place central hub near (500, 400); connected nodes at ~140 px clearance.

LAYOUT PRIORITY FOR COMPLEX GRAPHS:
- Prefer hierarchical or layered placement over trying to show every edge.
- When the graph becomes dense, reduce visual complexity first; semantic clarity is more important than drawing every link.
- Keep residual / skip connections visually distinct.

Advanced collision detection and routing are handled by application code. The model’s job is to supply sensible initial positions and clear semantic relationships.

==================================================
STEP 8 — NOTES
==================================================

Notes are first-class semantic elements.

Use notes when they help explain the subject, including:
- mechanisms and step-by-step working
- equations, definitions, and assumptions
- examples and intermediate results
- practical tips, implementation considerations, and pitfalls
- limitations, trade-offs, diagnostics, and research questions

Select note themes based on the topic and requested depth. These categories are examples, not a mandatory checklist.

Write topic-specific information. Prefer concise bullets that add insight beyond the main diagram.
Do not use generic content such as "KEY NOTES", "Important concept", "Main dependency", or "Expected result".

==================================================
STEP 9 — ARCHITECTURE DIAGRAMS
==================================================

For software / system architecture:

Prioritize:
1. major components
2. important data / control flow
3. external systems or actors
4. meaningful dependencies
5. storage / infrastructure only when relevant

Do not automatically create client, API gateway, service layer, database, cache, or queue unless actually relevant.

Use exact technologies when known (e.g. "PostgreSQL", "FastAPI", "Kafka") rather than generic labels.

==================================================
STEP 10 — COMPARISONS
==================================================

For comparisons:
- keep both sides visually parallel
- use equivalent levels of detail
- align corresponding concepts
- avoid mixing elements from one side into the other
- make the contrast obvious through structure

==================================================
STEP 11 — FINAL SELF-CHECK
==================================================

Before returning JSON, verify:

1. Every element has a clear purpose.
2. Every relationship is meaningful.
3. No technology or relationship was invented.
4. The chosen grammar matches the topic.
5. The main reading direction is obvious.
6. Labels are specific, readable, and free of relationship words (no “residual”, “skip”, etc. inside node labels).
7. Important elements have appropriate hierarchy.
8. There are no unnecessary elements.
9. There are no decorative relationships.
10. Coordinates are reasonable.
11. Connected elements are positioned so edges face each other (relationship-friendly).
12. Notes contain topic-specific information and match the requested depth.
13. The canvas includes all explicit deliverables requested by the user.
14. Complexity is appropriate: neither a superficial summary nor unnecessary sprawl.
15. Residual / skip connections are present when the architecture requires them, and they are drawn as true bypass relationships.
16. Dense many-to-many connections are represented with a few representative arrows + a clarifying note, not with visual spaghetti.

If removing an element would not reduce understanding, remove it. However, do not remove repeated nodes, edges, equations, or intermediate steps when those are essential to the requested technical explanation.

==================================================
CANVAS IR V2 JSON CONTRACT
==================================================

Return ONLY:

{
  "version": 2,
  "operations": [...]
}

Supported operations: add, update, delete

ADD NODE:
{
  "op": "add",
  "element": {
    "id": "unique-id",
    "kind": "node",
    "type": "rectangle",
    "label": "Concrete Concept",
    "role": "primary",
    "layer": "application",
    "position": { "x": 100, "y": 150 },
    "size": { "width": 180, "height": 80 },
    "style": { "visual": "primary" }
  }
}

ADD NOTE:
{
  "op": "add",
  "element": {
    "id": "note-id",
    "kind": "note",
    "title": "Key Points",
    "items": ["Specific point", "Another specific point"],
    "position": { "x": 700, "y": 150 },
    "size": { "width": 300, "height": 180 },
    "style": { "visual": "annotation" }
  }
}

ADD TEXT:
{
  "op": "add",
  "element": {
    "id": "title",
    "kind": "text",
    "text": "Specific Diagram Title",
    "position": { "x": 40, "y": 25 },
    "style": { "fontSize": 30 }
  }
}

ADD RELATIONSHIP:
{
  "op": "add",
  "element": {
    "id": "relationship-id",
    "kind": "relationship",
    "type": "arrow",
    "from": "source-id",
    "to": "target-id",
    "relationshipType": "produces",
    "label": "optional short text"
  }
}

ADD GROUP:
{
  "op": "add",
  "element": {
    "id": "group-id",
    "kind": "group",
    "label": "Processing Layer",
    "children": ["child-a", "child-b"],
    "style": { "visual": "group" }
  }
}

UPDATE / DELETE follow the same shapes as before.

IMPORTANT:
- Do not return native Excalidraw geometry for relationships.
- Relationship endpoints are represented only by from / to.
- The server computes the actual arrow geometry.
- Return no markdown, no explanation, no text outside the JSON object.
`;

// ============================================================
// EDIT PROMPT
// ============================================================

const EDIT_INSTRUCTIONS = `
EDITING IS THE DEFAULT MODE.

The existing canvas is authoritative.

Your job is to perform the SMALLEST SUFFICIENT MODIFICATION that satisfies the user's instruction.

PRESERVE EVERYTHING ELSE.

Do NOT regenerate the entire canvas unless the user explicitly asks for a redesign or full reorganization.

==================================================
EDIT PRINCIPLE
==================================================

Think:

USER REQUEST
    ↓
identify the exact target
    ↓
perform the smallest necessary operation
    ↓
leave everything else untouched

Examples:

"Rename Redis to PostgreSQL"
→ update only that element.

"Add a note about caching"
→ add only the note.

"Add one more bullet to the existing notes"
→ update only the note.

"Remove the Redis block"
→ delete only that block and let the server clean affected relationships.

"Change the second bullet"
→ update only that bullet.

"Move the API below the database"
→ update only its position.

"Add another diagram about authentication"
→ add a separate diagram without modifying the existing diagram.

"Improve the entire canvas"
→ broader changes are allowed because the user explicitly requested them.

==================================================
TARGET IDENTIFICATION
==================================================

When the user refers to:

"this"
"that box"
"the notes"
"the second diagram"
"the retrieval section"
"the API block"

use:
- labels
- ids
- existing positions
- groups
- surrounding elements
- relationships

to identify the most likely target.

Do not modify unrelated elements.

==================================================
NOTES & BULLETS
==================================================

Notes are first-class editable content.

When modifying an existing note, prefer surgical operations.

APPEND:

{
  "op": "update",
  "id": "note-id",
  "changes": {
    "items": {
      "append": "New bullet"
    }
  }
}

INSERT:

{
  "op": "update",
  "id": "note-id",
  "changes": {
    "items": {
      "insertAt": {
        "index": 1,
        "value": "Inserted bullet"
      }
    }
  }
}

UPDATE:

{
  "op": "update",
  "id": "note-id",
  "changes": {
    "items": {
      "updateAt": {
        "index": 1,
        "value": "Updated bullet"
      }
    }
  }
}

REMOVE:

{
  "op": "update",
  "id": "note-id",
  "changes": {
    "items": {
      "removeAt": 2
    }
  }
}

Only replace the entire items array when the user explicitly asks to replace/rewrite the complete list.

Do not silently rewrite existing bullets while adding a new bullet.

==================================================
TEXT EDITING
==================================================

For a text element:

- change only the requested text
- preserve position and style unless asked to change them

For a node label:

- update only the label unless the user requests a broader change

For a note title:

- update only the title unless the user asks to modify its bullets too

==================================================
RELATIONSHIPS
==================================================

Relationships can also be edited surgically.

To change the relationship label:

{
  "op": "update",
  "id": "arrow-id",
  "changes": {
    "label": "new relationship label"
  }
}

To change its source:

{
  "op": "update",
  "id": "arrow-id",
  "changes": {
    "from": "new-source-id"
  }
}

To change its destination:

{
  "op": "update",
  "id": "arrow-id",
  "changes": {
    "to": "new-target-id"
  }
}

To change the semantic relationship:

{
  "op": "update",
  "id": "arrow-id",
  "changes": {
    "relationshipType": "reads_from"
  }
}

Never create a replacement relationship when updating an existing one unless necessary.

When asked to add or change labels on MULTIPLE existing relationships (e.g. "label all the arrows"), you MUST use one "update" operation per relationship — never delete and recreate them. Deleting an arrow and failing to recreate it correctly is the most common way arrows are lost. If you are not adding a new connection, do not use "op": "add" for relationships at all.

To add a NEW relationship (use this exact shape — "type" is required and must be the literal string "arrow"):

{
  "op": "add",
  "element": {
    "id": "unique-arrow-id",
    "kind": "relationship",
    "type": "arrow",
    "from": "source-id",
    "to": "target-id",
    "relationshipType": "produces",
    "label": "optional short text"
  }
}

==================================================
ADDING ELEMENTS
==================================================

Every new element must:

- have a unique id
- have a clear semantic purpose
- use supported kinds
- use specific labels
- avoid unnecessary duplication
- be positioned intentionally

When adding a new node to an existing diagram, add relationships only when they are actually supported by the topic and existing structure.

Do not connect every new node to nearby elements.

==================================================
DELETIONS
==================================================

Use:

{
  "op": "delete",
  "id": "element-id"
}

When deleting a node, do NOT separately delete connected relationships unless necessary.

The server automatically removes relationships that refer to deleted elements.

==================================================
MULTIPLE DIAGRAMS
==================================================

The canvas may contain multiple independent diagrams.

When adding a new diagram:
- treat it as a separate visual unit
- keep it spatially separated
- add its own title when useful
- do not modify existing diagrams unless required

When editing one diagram:
- modify only that diagram
- preserve all others

==================================================
VISUAL CHANGES
==================================================

If asked to restyle one element:

update only its style.

If asked to restyle an entire section:

update only the elements in that section.

Do not restyle unrelated canvas content.

Semantic style values:

- primary
- secondary
- annotation
- decision
- external
- group
- default

==================================================
WHOLE-CANVAS REDESIGN
==================================================

Only perform broad changes when explicitly requested.

Examples:

"Reorganize the whole diagram."
"Make the architecture cleaner."
"Redesign this entire canvas."

In such cases:
- reposition relevant elements
- resize where useful
- reorganize relationships
- improve hierarchy
- preserve semantic meaning

Still do not invent technologies or relationships.

==================================================
OUTPUT CONTRACT
==================================================

Return ONLY:

{
  "version": 2,
  "operations": [...]
}

Allowed operations:

- add
- update
- delete

Every update must reference an existing id.

Every delete must reference an existing id.

Every add must use a unique id.

Return no markdown.
Return no explanation.
Return no text outside the JSON object.
`;


// ============================================================
// CONNECTION REPAIR PROMPT
// ============================================================

const ARROW_ONLY_INSTRUCTIONS = `
You are performing a connection-repair pass on a newly created diagram.

Your ONLY task is to add meaningful relationships between the EXISTING diagram nodes.

Do NOT:
- create nodes
- rename nodes
- move nodes
- resize nodes
- create notes
- create text
- create groups
- modify existing non-arrow elements
- create decorative relationships
- connect unrelated concepts

IMPORTANT:
The original generation produced few or zero relationships.
Your job is to recover the diagram's obvious semantic flow.

For architecture, pipeline, process, workflow, or model diagrams:

1. Identify ordered processing stages from the node labels and positions.
2. Connect consecutive stages when the relationship is clearly implied.
3. Preserve separate branches when the diagram contains multiple flows.
4. Connect branches when one component clearly feeds another.
5. For a model architecture, connect the actual computation/data flow, not merely spatially adjacent boxes.
6. If an encoder/decoder or similar split architecture exists, connect the output of the first branch to the appropriate processing stage in the second branch when clearly implied.
7. Do not add relationships solely because two boxes are close to each other.

The following kinds of relationships are appropriate:
- flow
- produces
- consumes
- transforms
- depends_on
- sends_to
- receives_from
- calls
- triggers
- leads_to

For an obvious sequential architecture, prefer explicit flow relationships
between consecutive stages.

There is NO N-1 requirement.
Do not invent relationships when the semantic connection is genuinely unclear.

ONLY use the exact node IDs supplied by the caller.

Return ONLY:

{
  "version": 2,
  "operations": [
    {
      "op": "add",
      "element": {
        "id": "unique-arrow-id",
        "kind": "relationship",
        "type": "arrow",
        "from": "source-id",
        "to": "target-id",
        "relationshipType": "flow"
      }
    }
  ]
}

Return no markdown.
Return no explanation.
`;

// ============================================================
// JSON PARSING
// ============================================================

function parseModelJson(value) {
  const cleaned = String(value || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");

    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");

    if (
      objectStart !== -1 &&
      objectEnd !== -1 &&
      objectEnd > objectStart
    ) {
      return JSON.parse(
        cleaned.slice(objectStart, objectEnd + 1)
      );
    }

    if (
      arrayStart !== -1 &&
      arrayEnd !== -1 &&
      arrayEnd > arrayStart
    ) {
      return JSON.parse(
        cleaned.slice(arrayStart, arrayEnd + 1)
      );
    }

    throw new Error("Model did not return valid JSON.");
  }
}

function extractOperations(value) {
  const parsed = parseModelJson(value);

  if (parsed && Array.isArray(parsed.operations)) {
    return parsed.operations;
  }

  // Backward compatibility with a bare operation array.
  if (Array.isArray(parsed)) {
    return parsed;
  }

  // Backward compatibility with the previous
  // { elements: [...] } response.
  if (parsed && Array.isArray(parsed.elements)) {
    return parsed.elements.map((element) => ({
      op: "add",
      element
    }));
  }

  return [];
}


// ============================================================
// GLOBAL LIMITS
// ============================================================

const MAX_COORDINATE_X = 6000;
const MAX_COORDINATE_Y = 3000;

const MAX_BLOCK_WIDTH = 3000;
const MAX_BLOCK_HEIGHT = 2500;

const MAX_TEXT_LENGTH = 6000;
const MAX_LABEL_LENGTH = 1000;

const ALLOWED_NODE_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond"
]);

const ALLOWED_KINDS = new Set([
  "node",
  "note",
  "text",
  "relationship",
  "group"
]);

const ALLOWED_VISUAL_STYLES = new Set([
  "primary",
  "secondary",
  "annotation",
  "decision",
  "external",
  "group",
  "default"
]);

const MAX_OPERATIONS = 200;

// ============================================================
// GEOMETRY & TEXT UTILITIES
// ============================================================

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;

  const text = value
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .trim();

  if (!text || text.length > maxLength) {
    return null;
  }

  return text;
}

function clampNumber(value, min, max, fallback) {
  return isFiniteNumber(value)
    ? Math.max(min, Math.min(value, max))
    : fallback;
}

function clampX(value, fallback = 40) {
  return clampNumber(
    value,
    0,
    MAX_COORDINATE_X,
    fallback
  );
}

function clampY(value, fallback = 40) {
  return clampNumber(
    value,
    0,
    MAX_COORDINATE_Y,
    fallback
  );
}

function clampWidth(value, fallback = 160, min = 80) {
  return clampNumber(
    value,
    min,
    MAX_BLOCK_WIDTH,
    fallback
  );
}

function clampHeight(value, fallback = 70, min = 40) {
  return clampNumber(
    value,
    min,
    MAX_BLOCK_HEIGHT,
    fallback
  );
}

function cleanId(value) {
  return cleanText(value, 100);
}


// ============================================================
// EXCALIDRAW NODE GEOMETRY
// ============================================================

/*
 * Returns a point on the boundary of `from` that faces `to`.
 * Arrow routing is handled by the obstacle-aware orthogonal router below.
 */
function edgePoint(from, to, offsetIndex = 0, totalFromEdge = 1) {
  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;

  const toCenterX = to.x + to.width / 2;
  const toCenterY = to.y + to.height / 2;

  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;

  // Spread multiple arrows connected to the same edge
  const edgeSpread = totalFromEdge > 1
    ? (offsetIndex - (totalFromEdge - 1) / 2) * 20
    : 0;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0
        ? from.x + from.width
        : from.x,
      y: Math.max(from.y + 10, Math.min(from.y + from.height - 10, fromCenterY + edgeSpread))
    };
  }

  return {
    x: Math.max(from.x + 10, Math.min(from.x + from.width - 10, fromCenterX + edgeSpread)),
    y: dy >= 0
      ? from.y + from.height
      : from.y
  };
}

function getFacingEdge(fromBlock, toBlock) {
  const dx = (toBlock.x + toBlock.width / 2) - (fromBlock.x + fromBlock.width / 2);
  const dy = (toBlock.y + toBlock.height / 2) - (fromBlock.y + fromBlock.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function pointOutsideEdge(point, edge, distance = 18) {
  switch (edge) {
    case "right": return { x: point.x + distance, y: point.y };
    case "left": return { x: point.x - distance, y: point.y };
    case "bottom": return { x: point.x, y: point.y + distance };
    default: return { x: point.x, y: point.y - distance };
  }
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
}

function pointInsideRect(point, rect) {
  return point.x > rect.left + 0.01 && point.x < rect.right - 0.01 &&
    point.y > rect.top + 0.01 && point.y < rect.bottom - 0.01;
}

function segmentHitsRect(a, b, rect) {
  if (Math.abs(a.y - b.y) < 0.01) {
    const y = a.y;
    if (y <= rect.top + 0.01 || y >= rect.bottom - 0.01) return false;
    return Math.max(Math.min(a.x, b.x), rect.left + 0.01) <
      Math.min(Math.max(a.x, b.x), rect.right - 0.01);
  }
  if (Math.abs(a.x - b.x) < 0.01) {
    const x = a.x;
    if (x <= rect.left + 0.01 || x >= rect.right - 0.01) return false;
    return Math.max(Math.min(a.y, b.y), rect.top + 0.01) <
      Math.min(Math.max(a.y, b.y), rect.bottom - 0.01);
  }
  return true;
}

function simplifyOrthogonalPath(points) {
  const unique = [];
  for (const point of points) {
    const previous = unique[unique.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > 0.01 || Math.abs(previous.y - point.y) > 0.01) {
      unique.push(point);
    }
  }

  const simplified = [];
  for (const point of unique) {
    while (simplified.length >= 2) {
      const a = simplified[simplified.length - 2];
      const b = simplified[simplified.length - 1];
      const collinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - point.x) < 0.01) ||
        (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - point.y) < 0.01);
      if (!collinear) break;
      simplified.pop();
    }
    simplified.push(point);
  }
  return simplified;
}

/*
 * Visibility-grid orthogonal router:
 * - uses ports on the actual node boundaries
 * - leaves each port in its outward direction
 * - routes around padded node rectangles
 * - penalizes bends so routes remain simple
 * - returns a polyline suitable for Excalidraw's arrow `points`
 */
function findOrthogonalPath(startLead, endLead, obstacles) {
  const clearance = 14;
  const nearby = obstacles.filter((r) =>
    r.right >= Math.min(startLead.x, endLead.x) - 220 &&
    r.left <= Math.max(startLead.x, endLead.x) + 220 &&
    r.bottom >= Math.min(startLead.y, endLead.y) - 220 &&
    r.top <= Math.max(startLead.y, endLead.y) + 220
  ).map((r) => ({
    left: r.left - clearance,
    right: r.right + clearance,
    top: r.top - clearance,
    bottom: r.bottom + clearance
  }));

  const margin = 80;
  const minX = Math.min(startLead.x, endLead.x, ...nearby.map((r) => r.left)) - margin;
  const maxX = Math.max(startLead.x, endLead.x, ...nearby.map((r) => r.right)) + margin;
  const minY = Math.min(startLead.y, endLead.y, ...nearby.map((r) => r.top)) - margin;
  const maxY = Math.max(startLead.y, endLead.y, ...nearby.map((r) => r.bottom)) + margin;

  let xs = uniqueSortedNumbers([
    startLead.x, endLead.x, minX, maxX,
    ...nearby.flatMap((r) => [r.left, r.right])
  ]);
  let ys = uniqueSortedNumbers([
    startLead.y, endLead.y, minY, maxY,
    ...nearby.flatMap((r) => [r.top, r.bottom])
  ]);

  // Avoid pathological grids on very large canvases. Keep the coordinates
  // closest to either endpoint and retain the outer escape lanes.
  const capCoordinates = (coords, a, b) => {
    if (coords.length <= 140) return coords;
    const mandatory = new Set([a, b, coords[0], coords[coords.length - 1]]);
    const remaining = coords.filter((v) => !mandatory.has(v))
      .sort((u, v) => Math.min(Math.abs(u - a), Math.abs(u - b)) -
        Math.min(Math.abs(v - a), Math.abs(v - b)))
      .slice(0, 136);
    return uniqueSortedNumbers([...mandatory, ...remaining]);
  };
  xs = capCoordinates(xs, startLead.x, endLead.x);
  ys = capCoordinates(ys, startLead.y, endLead.y);

  const blocked = (x, y) => nearby.some((r) => pointInsideRect({ x, y }, r));
  const clearSegment = (a, b) => nearby.every((r) => !segmentHitsRect(a, b, r));

  const startX = xs.indexOf(Math.round(startLead.x * 100) / 100);
  const startY = ys.indexOf(Math.round(startLead.y * 100) / 100);
  const endX = xs.indexOf(Math.round(endLead.x * 100) / 100);
  const endY = ys.indexOf(Math.round(endLead.y * 100) / 100);
  if ([startX, startY, endX, endY].some((v) => v < 0)) return null;

  const width = xs.length;
  const height = ys.length;
  const key = (ix, iy, dir) => `${ix},${iy},${dir}`;
  const parseKey = (value) => value.split(",").map(Number);
  const startKey = key(startX, startY, "N");
  const distances = new Map([[startKey, 0]]);
  const previous = new Map();
  const open = [{ key: startKey, cost: 0 }];
  const directions = [
    { dx: -1, dy: 0, dir: "H" },
    { dx: 1, dy: 0, dir: "H" },
    { dx: 0, dy: -1, dir: "V" },
    { dx: 0, dy: 1, dir: "V" }
  ];

  // Small binary min-heap.
  const push = (item) => {
    open.push(item);
    let i = open.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (open[parent].cost <= item.cost) break;
      open[i] = open[parent];
      i = parent;
    }
    open[i] = item;
  };
  const pop = () => {
    const root = open[0];
    const last = open.pop();
    if (open.length && last) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= open.length) break;
        if (child + 1 < open.length && open[child + 1].cost < open[child].cost) child++;
        if (open[child].cost >= last.cost) break;
        open[i] = open[child];
        i = child;
      }
      open[i] = last;
    }
    return root;
  };

  let finalKey = null;
  let iterations = 0;
  const maxIterations = Math.min(width * height * 4, 100000);
  while (open.length && iterations++ < maxIterations) {
    const current = pop();
    if (current.cost !== distances.get(current.key)) continue;
    const [ix, iy, dir] = parseKey(current.key);
    if (ix === endX && iy === endY) {
      finalKey = current.key;
      break;
    }

    const a = { x: xs[ix], y: ys[iy] };
    for (const move of directions) {
      const nx = ix + move.dx;
      const ny = iy + move.dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const b = { x: xs[nx], y: ys[ny] };
      if (blocked(b.x, b.y) || !clearSegment(a, b)) continue;

      const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const bendPenalty = dir !== "N" && dir !== move.dir ? 28 : 0;
      const nextKey = key(nx, ny, move.dir);
      const nextCost = current.cost + length + bendPenalty;
      if (nextCost < (distances.get(nextKey) ?? Infinity)) {
        distances.set(nextKey, nextCost);
        previous.set(nextKey, current.key);
        push({ key: nextKey, cost: nextCost });
      }
    }
  }

  if (!finalKey) return null;
  const path = [];
  let cursor = finalKey;
  while (cursor) {
    const [ix, iy] = parseKey(cursor);
    path.push({ x: xs[ix], y: ys[iy] });
    if (cursor === startKey) break;
    cursor = previous.get(cursor);
  }
  path.reverse();
  return simplifyOrthogonalPath(path);
}

function buildArrowGeometry(
  startBlock,
  endBlock,
  startIndex = 0,
  startTotal = 1,
  endIndex = 0,
  endTotal = 1,
  nativeMap = null
) {
  const startPoint = edgePoint(startBlock, endBlock, startIndex, startTotal);
  const endPoint = edgePoint(endBlock, startBlock, endIndex, endTotal);
  const startEdge = getFacingEdge(startBlock, endBlock);
  const endEdge = getFacingEdge(endBlock, startBlock);
  const startLead = pointOutsideEdge(startPoint, startEdge);
  const endLead = pointOutsideEdge(endPoint, endEdge);

  const obstacles = [];
  if (nativeMap) {
    for (const block of nativeMap.values()) {
      if (!isNativeBlock(block) || block.id === startBlock.id || block.id === endBlock.id) continue;
      if (![block.x, block.y, block.width, block.height].every(Number.isFinite)) continue;
      obstacles.push({
        left: block.x,
        top: block.y,
        right: block.x + block.width,
        bottom: block.y + block.height
      });
    }
  }

  const middlePath = findOrthogonalPath(startLead, endLead, obstacles);
  let absolutePoints;
  if (middlePath && middlePath.length) {
    absolutePoints = simplifyOrthogonalPath([startPoint, startLead, ...middlePath, endLead, endPoint]);
  } else {
    // Last-resort fallback for overlapping or degenerate layouts.
    absolutePoints = simplifyOrthogonalPath([
      startPoint,
      { x: endPoint.x, y: startPoint.y },
      endPoint
    ]);
  }

  return {
    x: absolutePoints[0].x,
    y: absolutePoints[0].y,
    points: absolutePoints.map((point, index) => index === 0
      ? [0, 0]
      : [point.x - absolutePoints[0].x, point.y - absolutePoints[0].y])
  };
}

function rerouteAllArrows(nativeMap) {
  const startEdgeGroups = new Map();
  const endEdgeGroups = new Map();

  for (const [id, native] of nativeMap) {
    if (!isNativeArrow(native)) continue;
    const startId = getArrowEndpointId(native, "start");
    const endId = getArrowEndpointId(native, "end");
    const startBlock = nativeMap.get(startId);
    const endBlock = nativeMap.get(endId);
    if (!startBlock || !endBlock || !isNativeBlock(startBlock) || !isNativeBlock(endBlock)) continue;

    const startEdge = getFacingEdge(startBlock, endBlock);
    const endEdge = getFacingEdge(endBlock, startBlock);
    const startKey = `${startId}:${startEdge}`;
    const endKey = `${endId}:${endEdge}`;
    if (!startEdgeGroups.has(startKey)) startEdgeGroups.set(startKey, []);
    if (!endEdgeGroups.has(endKey)) endEdgeGroups.set(endKey, []);
    startEdgeGroups.get(startKey).push(id);
    endEdgeGroups.get(endKey).push(id);
  }

  for (const [id, native] of nativeMap) {
    if (!isNativeArrow(native)) continue;
    const startId = getArrowEndpointId(native, "start");
    const endId = getArrowEndpointId(native, "end");
    const startBlock = nativeMap.get(startId);
    const endBlock = nativeMap.get(endId);
    if (!startBlock || !endBlock || !isNativeBlock(startBlock) || !isNativeBlock(endBlock)) continue;

    const startEdge = getFacingEdge(startBlock, endBlock);
    const endEdge = getFacingEdge(endBlock, startBlock);
    const startList = startEdgeGroups.get(`${startId}:${startEdge}`) || [id];
    const endList = endEdgeGroups.get(`${endId}:${endEdge}`) || [id];
    const geometry = buildArrowGeometry(
      startBlock,
      endBlock,
      Math.max(0, startList.indexOf(id)),
      startList.length,
      Math.max(0, endList.indexOf(id)),
      endList.length,
      nativeMap
    );

    native.x = geometry.x;
    native.y = geometry.y;
    native.points = geometry.points;
    native.endArrowhead = "arrow";
    native.strokeWidth = 2;
    native.roughness = 0;
    if (!native.strokeColor || native.strokeColor === "#1e1e1e") {
      native.strokeColor = "#495057";
    }
  }
}


// ============================================================
// SEMANTIC THEME
// ============================================================

/*
 * The model selects semantic visual styles.
 *
 * The application owns the actual Excalidraw styling.
 *
 * This prevents the model from inventing arbitrary colors,
 * line widths, fills, etc. for every individual element.
 */
const THEME_STYLES = {
  primary: {
    backgroundColor: "#e7f5ff",
    strokeColor: "#1971c2",
    fillStyle: "solid",
    roughness: 0,
    strokeWidth: 2
  },

  secondary: {
    backgroundColor: "#f3f0ff",
    strokeColor: "#6741d9",
    fillStyle: "solid",
    roughness: 0,
    strokeWidth: 2
  },

  annotation: {
    backgroundColor: "#fff3cd",
    strokeColor: "#f08c00",
    fillStyle: "hachure",
    roughness: 1,
    strokeWidth: 2
  },

  decision: {
    backgroundColor: "#ebfbee",
    strokeColor: "#2b8a3e",
    fillStyle: "solid",
    roughness: 0,
    strokeWidth: 2
  },

  external: {
    backgroundColor: "#f8f9fa",
    strokeColor: "#868e96",
    fillStyle: "solid",
    roughness: 0,
    strokeWidth: 1.5
  },

  group: {
    backgroundColor: "transparent",
    strokeColor: "#ced4da",
    fillStyle: "hachure",
    strokeLineDash: [8, 8],
    roughness: 0,
    strokeWidth: 1.5
  },

  default: {
    backgroundColor: "#ffffff",
    strokeColor: "#343a40",
    fillStyle: "solid",
    roughness: 0,
    strokeWidth: 1.5
  }
};

const LEGACY_THEME_STYLES = {
  primary: { backgroundColor: "#e7f5ff", strokeColor: "#1971c2" },
  secondary: { backgroundColor: "#f3f0ff", strokeColor: "#6741d9" },
  annotation: { backgroundColor: "#fff3cd", strokeColor: "#f08c00" },
  decision: { backgroundColor: "#ebfbee", strokeColor: "#2b8a3e" },
  external: { backgroundColor: "#f8f9fa", strokeColor: "#868e96" }
};

function getExcalidrawStyle(visualStyle) {
  const safeStyle = ALLOWED_VISUAL_STYLES.has(visualStyle)
    ? visualStyle
    : "default";

  return {
    ...THEME_STYLES[safeStyle]
  };
}

function resolveVisualStyle(element) {
  const requested = sanitizeVisualStyle(
    element?.style?.visual
  );

  if (requested) {
    return requested;
  }

  if (element?.kind === "note") return "annotation";
  if (element?.kind === "group") return "group";
  if (element?.kind === "relationship") return "default";
  if (element?.type === "diamond" || element?.role === "decision") {
    return "decision";
  }
  if (element?.type === "ellipse" || element?.role === "external") {
    return "external";
  }
  if (element?.role === "secondary") return "secondary";

  return "primary";
}


// ============================================================
// SEMANTIC METADATA VALIDATION
// ============================================================

const ALLOWED_ROLES = new Set([
  "hero",
  "primary",
  "secondary",
  "supporting",
  "external",
  "decision"
]);

const ALLOWED_LAYERS = new Set([
  "presentation",
  "application",
  "processing",
  "integration",
  "data",
  "external",
  "annotation"
]);

const ALLOWED_RELATIONSHIP_TYPES = new Set([
  "flow",
  "request",
  "response",
  "dependency",
  "contains",
  "produces",
  "consumes",
  "reads_from",
  "writes_to",
  "triggers",
  "calls",
  "transforms",
  "validates",
  "sends_to",
  "receives_from",
  "leads_to",
  "compares_with"
]);

function sanitizeRole(value) {
  if (typeof value !== "string") return undefined;
  return ALLOWED_ROLES.has(value) ? value : undefined;
}

function sanitizeLayer(value) {
  if (typeof value !== "string") return undefined;
  return ALLOWED_LAYERS.has(value) ? value : undefined;
}

function sanitizeVisualStyle(value) {
  if (typeof value !== "string") return undefined;
  return ALLOWED_VISUAL_STYLES.has(value)
    ? value
    : undefined;
}

function sanitizeRelationshipType(value) {
  if (typeof value !== "string") return undefined;

  return ALLOWED_RELATIONSHIP_TYPES.has(value)
    ? value
    : cleanText(value, 50) || undefined;
}


// ============================================================
// IR METADATA HELPERS
// ============================================================

/*
 * Keep semantic metadata on the IR representation.
 *
 * IMPORTANT:
 * Native Excalidraw elements do not necessarily contain all
 * semantic metadata. The frontend can later preserve this
 * metadata explicitly. Until then, the backend remains tolerant
 * of its absence.
 */
function copySemanticMetadata(source, target) {
  if (!source || typeof source !== "object") {
    return target;
  }

  const role = sanitizeRole(source.role);
  const layer = sanitizeLayer(source.layer);
  const visual = sanitizeVisualStyle(source.style?.visual);

  if (role) {
    target.role = role;
  }

  if (layer) {
    target.layer = layer;
  }

  if (visual) {
    target.style = {
      ...(target.style || {}),
      visual
    };
  }

  if (source.group !== undefined) {
    const groupId = cleanId(source.group);

    if (groupId) {
      target.group = groupId;
    }
  }

  return target;
}


// ============================================================
// IR -> NATIVE EXCALIDRAW VALIDATION
// ============================================================

function sanitizeNodeType(type) {
  if (typeof type !== "string") {
    return "rectangle";
  }

  return ALLOWED_NODE_TYPES.has(type)
    ? type
    : "rectangle";
}

function normalizePosition(position) {
  return {
    x: clampX(position?.x),
    y: clampY(position?.y)
  };
}

function normalizeSize(size, options = {}) {
  const {
    fallbackWidth = 160,
    fallbackHeight = 70,
    minWidth = 80,
    minHeight = 40
  } = options;

  return {
    width: clampWidth(
      size?.width,
      fallbackWidth,
      minWidth
    ),

    height: clampHeight(
      size?.height,
      fallbackHeight,
      minHeight
    )
  };
}


// ============================================================
// SEMANTIC ELEMENT HELPERS
// ============================================================

function isNodeIR(element) {
  return (
    element &&
    element.kind === "node" &&
    ALLOWED_NODE_TYPES.has(element.type)
  );
}

function isNoteIR(element) {
  return (
    element &&
    element.kind === "note"
  );
}

function isTextIR(element) {
  return (
    element &&
    element.kind === "text"
  );
}

function isRelationshipIR(element) {
  return (
    element &&
    element.kind === "relationship" &&
    element.type === "arrow"
  );
}

function isGroupIR(element) {
  return (
    element &&
    element.kind === "group"
  );
}


// ============================================================
// NATIVE EXCALIDRAW HELPERS
// ============================================================

function getNativeElementLabel(element) {
  if (!element || typeof element !== "object") {
    return "";
  }

  if (
    element.label &&
    typeof element.label.text === "string"
  ) {
    return element.label.text;
  }

  if (typeof element.text === "string") {
    return element.text;
  }

  return "";
}

function getArrowEndpointId(element, endpoint) {
  if (!element || typeof element !== "object") {
    return null;
  }

  if (endpoint === "start") {
    return cleanId(
      element.startBinding?.elementId ||
      element.start?.id ||
      null
    );
  }

  return cleanId(
    element.endBinding?.elementId ||
    element.end?.id ||
    null
  );
}

function isNativeBlock(element) {
  return (
    element &&
    (
      element.type === "rectangle" ||
      element.type === "ellipse" ||
      element.type === "diamond"
    )
  );
}

function isNativeText(element) {
  return (
    element &&
    element.type === "text"
  );
}

function isNativeArrow(element) {
  return (
    element &&
    element.type === "arrow"
  );
}


// ============================================================
// NOTE PARSING
// ============================================================

function parseNoteText(text) {
  const safeText =
    typeof text === "string"
      ? text
      : "";

  const lines = safeText.split("\n");

  if (lines.length === 0) {
    return {
      title: "Notes",
      items: []
    };
  }

  const title =
    cleanText(lines[0], 200) ||
    "Notes";

  const items = lines
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[-•*]\s+/.test(line))
    .map((line) =>
      line.replace(/^[-•*]\s*/, "")
    )
    .filter(Boolean);

  return {
    title,
    items
  };
}


// ============================================================
// BULLET OPERATIONS
// ============================================================

function applyBulletChanges(items, changes) {
  const result = Array.isArray(items)
    ? [...items]
    : [];

  if (!changes || typeof changes !== "object") {
    return result;
  }

  if (typeof changes.append === "string") {
    const value = cleanText(changes.append, 500);

    if (value) {
      result.push(value);
    }
  }

  if (
    changes.insertAt &&
    typeof changes.insertAt === "object"
  ) {
    const index = Number(changes.insertAt.index);
    const value = cleanText(
      changes.insertAt.value,
      500
    );

    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index <= result.length &&
      value
    ) {
      result.splice(index, 0, value);
    }
  }

  if (
    changes.updateAt &&
    typeof changes.updateAt === "object"
  ) {
    const index = Number(changes.updateAt.index);
    const value = cleanText(
      changes.updateAt.value,
      500
    );

    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < result.length &&
      value
    ) {
      result[index] = value;
    }
  }

  if (typeof changes.removeAt === "number") {
    const index = Math.trunc(changes.removeAt);

    if (
      index >= 0 &&
      index < result.length
    ) {
      result.splice(index, 1);
    }
  }

  if (Array.isArray(changes.replace)) {
    result.splice(
      0,
      result.length,
      ...changes.replace
        .map((item) => cleanText(item, 500))
        .filter(Boolean)
    );
  }

  return result;
}


// ============================================================
// NATIVE ARROW ROUTING
// ============================================================

function rerouteNativeArrow(
  arrow,
  nativeMap
) {
  if (!isNativeArrow(arrow)) {
    return false;
  }

  const startId = getArrowEndpointId(
    arrow,
    "start"
  );

  const endId = getArrowEndpointId(
    arrow,
    "end"
  );

  if (!startId || !endId) {
    return false;
  }

  const startBlock = nativeMap.get(startId);
  const endBlock = nativeMap.get(endId);

  if (
    !startBlock ||
    !endBlock ||
    !isNativeBlock(startBlock) ||
    !isNativeBlock(endBlock)
  ) {
    return false;
  }

  if (
    typeof startBlock.width !== "number" ||
    typeof startBlock.height !== "number" ||
    typeof endBlock.width !== "number" ||
    typeof endBlock.height !== "number"
  ) {
    return false;
  }

  const geometry = buildArrowGeometry(
    startBlock,
    endBlock,
    0,
    1,
    0,
    1,
    nativeMap
  );

  arrow.x = geometry.x;
  arrow.y = geometry.y;
  arrow.points = geometry.points;

  return true;
}

// ============================================================
// EXISTING CANVAS -> SEMANTIC IR
// ============================================================

/*
 * convertNativeElementsToIR()
 *
 * Purpose:
 *   Give the LLM a compact semantic representation of the
 *   existing canvas without replacing the actual native
 *   Excalidraw elements.
 *
 * IMPORTANT:
 *   This function is READ-ONLY.
 *
 *   The original Excalidraw elements remain authoritative and
 *   are preserved separately in applyOperationsToCanvas().
 */
function convertNativeElementsToIR(elements) {
  if (!Array.isArray(elements)) {
    return [];
  }

  const ir = [];

  for (const element of elements) {
    if (
      !element ||
      typeof element !== "object" ||
      typeof element.id !== "string"
    ) {
      continue;
    }

    const id = cleanId(element.id);

    if (!id) {
      continue;
    }

    // ----------------------------------------------------------
    // Relationship / Arrow
    // ----------------------------------------------------------

    if (isNativeArrow(element)) {
      const from = getArrowEndpointId(
        element,
        "start"
      );

      const to = getArrowEndpointId(
        element,
        "end"
      );

      const relationship = {
        id,
        kind: "relationship",
        type: "arrow",
        from,
        to,
        label: cleanText(
          element.label?.text || "",
          100
        ) || ""
      };

      /*
       * Native Excalidraw does not necessarily preserve the
       * semantic relationshipType. Keep any application-level
       * metadata if it exists.
       */
      if (
        typeof element.relationshipType === "string"
      ) {
        relationship.relationshipType =
          sanitizeRelationshipType(
            element.relationshipType
          );
      }

      ir.push(relationship);
      continue;
    }

    // ----------------------------------------------------------
    // Free-form text
    // ----------------------------------------------------------

    if (isNativeText(element)) {
      ir.push({
        id,
        kind: "text",
        text: cleanText(
          element.text || "",
          MAX_TEXT_LENGTH
        ) || "",
        position: {
          x: clampX(element.x),
          y: clampY(element.y)
        },
        style: {
          fontSize: isFiniteNumber(element.fontSize)
            ? Math.max(
                12,
                Math.min(element.fontSize, 36)
              )
            : 20
        }
      });

      continue;
    }

    // ----------------------------------------------------------
    // Rectangle / Ellipse / Diamond
    // ----------------------------------------------------------

    if (isNativeBlock(element)) {
      const rawLabel = getNativeElementLabel(
        element
      );

      /*
       * Notes are currently represented in the existing canvas
       * as rectangle-like elements containing a title followed
       * by bullet lines.
       *
       * This is a compatibility heuristic. A future frontend
       * can preserve explicit semantic metadata and make this
       * conversion exact.
       */
      const noteData = parseNoteText(
        rawLabel
      );

      const hasBullets =
        rawLabel
          .split("\n")
          .slice(1)
          .some((line) =>
            /^[-•*]\s+/.test(line.trim())
          );

      if (hasBullets) {
        const note = {
          id,
          kind: "note",
          title: noteData.title,
          items: noteData.items,

          position: {
            x: clampX(element.x),
            y: clampY(element.y)
          },

          size: {
            width: clampWidth(
              element.width,
              250,
              100
            ),
            height: clampHeight(
              element.height,
              200,
              60
            )
          }
        };

        /*
         * Preserve semantic metadata when a frontend or another
         * stage has stored it directly on the element.
         */
        copySemanticMetadata(
          element,
          note
        );

        ir.push(note);
        continue;
      }

      const node = {
        id,
        kind: "node",
        type: sanitizeNodeType(
          element.type
        ),
        label: cleanText(
          rawLabel,
          MAX_LABEL_LENGTH
        ) || "",

        position: {
          x: clampX(element.x),
          y: clampY(element.y)
        },

        size: {
          width: clampWidth(
            element.width,
            160,
            80
          ),
          height: clampHeight(
            element.height,
            70,
            40
          )
        }
      };

      copySemanticMetadata(
        element,
        node
      );

      /*
       * Basic compatibility detection for semantic visual
       * styles from previously rendered elements.
       */
      const detectedStyle =
        detectVisualStyleFromNativeElement(
          element
        );

      if (
        detectedStyle &&
        !node.style?.visual
      ) {
        node.style = {
          ...(node.style || {}),
          visual: detectedStyle
        };
      }

      ir.push(node);
      continue;
    }

    /*
     * Unsupported native element types are intentionally omitted.
     *
     * The actual native element remains untouched in the
     * original scene. This function only controls what the LLM
     * sees.
     */
  }

  return ir;
}


// ============================================================
// NATIVE STYLE -> SEMANTIC STYLE
// ============================================================

function detectVisualStyleFromNativeElement(
  element
) {
  if (!element || typeof element !== "object") {
    return undefined;
  }

  /*
   * Direct semantic metadata wins when available.
   */
  if (
    typeof element.style?.visual === "string" &&
    ALLOWED_VISUAL_STYLES.has(
      element.style.visual
    )
  ) {
    return element.style.visual;
  }

  if (
    typeof element.visualStyle === "string" &&
    ALLOWED_VISUAL_STYLES.has(
      element.visualStyle
    )
  ) {
    return element.visualStyle;
  }

  /*
   * Heuristic fallback based on generated theme values.
   *
   * This is intentionally conservative.
   */
  const background = element.backgroundColor;
  const stroke = element.strokeColor;

  for (const [
    styleName,
    style
  ] of Object.entries(THEME_STYLES)) {
    if (
      background === style.backgroundColor &&
      stroke === style.strokeColor
    ) {
      return styleName;
    }
  }

  for (const [
    styleName,
    style
  ] of Object.entries(LEGACY_THEME_STYLES)) {
    if (
      background === style.backgroundColor &&
      stroke === style.strokeColor
    ) {
      return styleName;
    }
  }

  return undefined;
}


// ============================================================
// IR -> ONE NATIVE EXCALIDRAW ELEMENT
// ============================================================

/*
 * This function is ONLY used when an element is newly added.
 *
 * Existing native elements are NEVER passed through this
 * function during an ordinary edit.
 */
function renderSingleIRNode(element) {
  if (
    !element ||
    typeof element !== "object" ||
    !element.id
  ) {
    return null;
  }

  const id = cleanId(element.id);

  if (!id) {
    return null;
  }

  const position =
    normalizePosition(
      element.position
    );

  const style =
    getExcalidrawStyle(
      element.style?.visual
    );

  // ----------------------------------------------------------
  // Relationship
  // ----------------------------------------------------------

  if (isRelationshipIR(element)) {
    const out = {
      id,
      type: "arrow",

      /*
       * Temporary values.
       *
       * applyOperationsToCanvas() routes the arrow after the
       * complete operation batch has been applied.
       */
      x: 0,
      y: 0,

      points: [
        [0, 0],
        [10, 10]
      ],

      startBinding: {
        elementId: cleanId(element.from)
      },

      endBinding: {
        elementId: cleanId(element.to)
      },

      strokeColor: "#495057",
      strokeWidth: 2,
      roughness: 0,
      endArrowhead: "arrow"
    };

    const label =
      cleanText(
        element.label,
        40
      );

    if (label) {
      // Keep arrow labels concise (max 20 chars) to prevent box collisions
      const shortLabel = label.length > 20 ? label.slice(0, 18).trim() + "..." : label;
      out.label = {
        text: shortLabel
      };
    }

    /*
     * Preserve semantic relationship metadata on newly created
     * native elements. This is harmless for the current frontend
     * and gives future versions a way to recover it.
     */
    const relationshipType =
      sanitizeRelationshipType(
        element.relationshipType
      );

    if (relationshipType) {
      out.relationshipType =
        relationshipType;
    }

    return out;
  }

  // ----------------------------------------------------------
  // Text
  // ----------------------------------------------------------

  if (isTextIR(element)) {
    const fontSize =
      isFiniteNumber(
        element.style?.fontSize
      )
        ? Math.max(
            12,
            Math.min(
              Math.round(
                element.style.fontSize
              ),
              48
            )
          )
        : 20;

    return {
      id,
      type: "text",

      x: position.x,
      y: position.y,

      text:
        cleanText(
          element.text,
          MAX_TEXT_LENGTH
        ) || "",

      fontSize,

      backgroundColor:
        "transparent",

      strokeColor:
        "#212529"
    };
  }

  // ----------------------------------------------------------
  // Group
  // ----------------------------------------------------------

  if (isGroupIR(element)) {
    const size =
      normalizeSize(
        element.size,
        {
          fallbackWidth: 300,
          fallbackHeight: 180,
          minWidth: 100,
          minHeight: 80
        }
      );

    const out = {
      id,
      type: "rectangle",

      x: position.x,
      y: position.y,

      width: size.width,
      height: size.height,

      label: {
        text:
          cleanText(
            element.label,
            200
          ) || ""
      },

      ...getExcalidrawStyle(
        "group"
      )
    };

    /*
     * Store semantic group metadata directly on the native
     * element so it survives a later backend edit as long as
     * the frontend returns the native scene unchanged.
     */
    out.semanticKind = "group";
    out.visualStyle = resolveVisualStyle(element);

    if (Array.isArray(element.children)) {
      out.children = [
        ...element.children
          .map(cleanId)
          .filter(Boolean)
      ];
    }

    return out;
  }

  // ----------------------------------------------------------
  // Note
  // ----------------------------------------------------------

  if (isNoteIR(element)) {
    const size =
      normalizeSize(
        element.size,
        {
          fallbackWidth: 280,
          fallbackHeight: 180,
          minWidth: 100,
          minHeight: 60
        }
      );

    const title =
      cleanText(
        element.title,
        200
      ) || "Notes";

    const items =
      Array.isArray(element.items)
        ? element.items
            .map((item) =>
              cleanText(item, 500)
            )
            .filter(Boolean)
        : [];

    const lines = [title];

    if (items.length > 0) {
      lines.push("");

      for (const item of items) {
        lines.push(`- ${item}`);
      }
    }

    const noteStyle =
      getExcalidrawStyle(
        element.style?.visual ||
        "annotation"
      );

    const out = {
      id,
      type: "rectangle",

      x: position.x,
      y: position.y,

      width: size.width,
      height: size.height,

      label: {
        text: lines.join("\n")
      },

      ...noteStyle,

      semanticKind: "note",
      visualStyle: resolveVisualStyle(element)
    };

    return out;
  }

  // ----------------------------------------------------------
  // Node
  // ----------------------------------------------------------

  if (isNodeIR(element)) {
    const size =
      normalizeSize(
        element.size,
        {
          fallbackWidth: 160,
          fallbackHeight: 70
        }
      );

    const out = {
      id,
      type: sanitizeNodeType(
        element.type
      ),

      x: position.x,
      y: position.y,

      width: size.width,
      height: size.height,

      label: {
        text:
          cleanText(
            element.label,
            MAX_LABEL_LENGTH
          ) || ""
      },

      ...style
    };

    /*
     * Preserve semantic metadata on newly created native
     * elements so subsequent edits can recover it.
     */
    const role =
      sanitizeRole(
        element.role
      );

    const layer =
      sanitizeLayer(
        element.layer
      );

    const group =
      cleanId(
        element.group
      );

    if (role) {
      out.role = role;
    }

    if (layer) {
      out.layer = layer;
    }

    if (group) {
      out.group = group;
    }

    out.visualStyle = resolveVisualStyle(element);

    out.semanticKind = "node";

    return out;
  }

  return null;
}


// ============================================================
// PATCH EXISTING NATIVE ELEMENT
// ============================================================

function applyNativeLabelChange(
  native,
  label
) {
  const cleaned =
    cleanText(
      label,
      MAX_LABEL_LENGTH
    );

  if (!cleaned) {
    return;
  }

  native.label = {
    text: cleaned
  };
}

function applyNativeTextChange(
  native,
  text
) {
  const cleaned =
    cleanText(
      text,
      MAX_TEXT_LENGTH
    );

  if (!cleaned) {
    return;
  }

  native.text = cleaned;
}

function applyNativePositionChange(
  native,
  position
) {
  if (
    !position ||
    typeof position !== "object"
  ) {
    return;
  }

  if (
    isFiniteNumber(position.x)
  ) {
    native.x =
      clampX(
        position.x,
        native.x
      );
  }

  if (
    isFiniteNumber(position.y)
  ) {
    native.y =
      clampY(
        position.y,
        native.y
      );
  }
}

function applyNativeSizeChange(
  native,
  size
) {
  if (
    !size ||
    typeof size !== "object"
  ) {
    return;
  }

  if (
    isFiniteNumber(size.width) &&
    typeof native.width === "number"
  ) {
    native.width =
      clampWidth(
        size.width,
        native.width,
        80
      );
  }

  if (
    isFiniteNumber(size.height) &&
    typeof native.height === "number"
  ) {
    native.height =
      clampHeight(
        size.height,
        native.height,
        40
      );
  }
}

function applyNativeStyleChange(
  native,
  style
) {
  if (
    !style ||
    typeof style !== "object"
  ) {
    return;
  }

  if (
    typeof style.visual === "string"
  ) {
    Object.assign(
      native,
      getExcalidrawStyle(
        style.visual
      )
    );

    /*
     * Preserve the semantic visual token for future edits.
     */
    if (
      ALLOWED_VISUAL_STYLES.has(
        style.visual
      )
    ) {
      native.visualStyle =
        style.visual;
    }
  }
}


// ============================================================
// NOTE CONTENT -> NATIVE ELEMENT
// ============================================================

function rebuildNativeNoteLabel(
  native,
  title,
  items
) {
  const safeTitle =
    cleanText(
      title,
      200
    ) || "Notes";

  const safeItems =
    Array.isArray(items)
      ? items
          .map((item) =>
            cleanText(item, 500)
          )
          .filter(Boolean)
      : [];

  const lines = [
    safeTitle
  ];

  if (safeItems.length > 0) {
    lines.push("");

    for (const item of safeItems) {
      lines.push(`- ${item}`);
    }
  }

  native.label = {
    text: lines.join("\n")
  };

  native.semanticKind =
    "note";
}


// ============================================================
// SURGICAL CANVAS OPERATION ENGINE
// ============================================================

/*
 * applyOperationsToCanvas()
 *
 * This is the central edit engine.
 *
 * Existing native Excalidraw elements are copied into a map and
 * retained as the authoritative representation.
 *
 * The LLM only supplies semantic operations.
 *
 * Existing elements are modified in place only when explicitly
 * targeted by an operation.
 */
function applyOperationsToCanvas(
  existingElements,
  operations
) {
  const nativeMap =
    new Map();

  for (
    const element of
    Array.isArray(existingElements)
      ? existingElements
      : []
  ) {
    if (
      element &&
      typeof element.id === "string"
    ) {
      nativeMap.set(
        element.id,
        {
          ...element
        }
      );
    }
  }

  /*
   * Semantic snapshot used only for understanding note/group
   * state and for applying structured updates.
   */
  const irElements =
    convertNativeElementsToIR(
      existingElements
    );

  const irMap =
    new Map(
      irElements.map(
        (element) => [
          element.id,
          element
        ]
      )
    );

  /*
   * Arrow ids that may need rerouting after changes.
   */
  const arrowsToReroute =
    new Set();

  /*
   * Groups whose bounds may need recomputation.
   */
  const groupsToRecompute =
    new Set();

  /*
   * Keep track of deleted ids.
   */
  const deletedIds =
    new Set();

  /*
   * Prevent malformed or excessively large model responses
   * from causing uncontrolled changes.
   */
  const safeOperations =
    Array.isArray(operations)
      ? operations.slice(
          0,
          MAX_OPERATIONS
        )
      : [];

  for (
    const operation
    of safeOperations
  ) {
    if (
      !operation ||
      typeof operation !== "object"
    ) {
      continue;
    }

    const op =
      operation.op;

    // ========================================================
    // ADD
    // ========================================================

    if (
      op === "add" &&
      operation.element &&
      typeof operation.element === "object"
    ) {
      const element =
        sanitizeIRForAdd(
          operation.element
        );

      if (!element) {
        continue;
      }

      /*
       * Do not let an "add" silently overwrite an existing
       * element.
       *
       * The model must use update for existing ids.
       */
      if (
        nativeMap.has(
          element.id
        )
      ) {
        continue;
      }

      const native =
        renderSingleIRNode(
          element
        );

      if (!native) {
        continue;
      }

      nativeMap.set(
        element.id,
        native
      );

      irMap.set(
        element.id,
        element
      );

      /*
       * Newly added arrow must be routed after all operations
       * have been applied.
       */
      if (
        isRelationshipIR(element)
      ) {
        arrowsToReroute.add(
          element.id
        );
      }

      /*
       * Groups depend on children geometry.
       */
      if (
        isGroupIR(element)
      ) {
        groupsToRecompute.add(
          element.id
        );
      }

      continue;
    }

    // ========================================================
    // DELETE
    // ========================================================

    if (
      op === "delete" &&
      typeof operation.id === "string"
    ) {
      const id =
        cleanId(
          operation.id
        );

      if (!id) {
        continue;
      }

      if (
        nativeMap.has(id)
      ) {
        nativeMap.delete(id);
      }

      irMap.delete(id);

      deletedIds.add(id);

      /*
       * Connected arrows are cleaned automatically after all
       * operations have been applied.
       */
      continue;
    }

    // ========================================================
    // UPDATE
    // ========================================================

    if (
      op === "update" &&
      typeof operation.id === "string"
    ) {
      const id =
        cleanId(
          operation.id
        );

      if (!id) {
        continue;
      }

      const native =
        nativeMap.get(id);

      const existingIR =
        irMap.get(id);

      if (
        !native ||
        !existingIR ||
        !operation.changes ||
        typeof operation.changes !== "object"
      ) {
        continue;
      }

      const changes =
        operation.changes;

      // ------------------------------------------------------
      // LABEL
      // ------------------------------------------------------

      if (
        changes.label !== undefined
      ) {
        applyNativeLabelChange(
          native,
          changes.label
        );

        existingIR.label =
          cleanText(
            changes.label,
            MAX_LABEL_LENGTH
          ) || existingIR.label;
      }

      // ------------------------------------------------------
      // TEXT
      // ------------------------------------------------------

      if (
        changes.text !== undefined
      ) {
        applyNativeTextChange(
          native,
          changes.text
        );

        existingIR.text =
          cleanText(
            changes.text,
            MAX_TEXT_LENGTH
          ) || existingIR.text;
      }

      // ------------------------------------------------------
      // TITLE
      // ------------------------------------------------------

      if (
        changes.title !== undefined
      ) {
        const title =
          cleanText(
            changes.title,
            200
          );

        if (
          title &&
          existingIR.kind === "note"
        ) {
          existingIR.title =
            title;

          rebuildNativeNoteLabel(
            native,
            existingIR.title,
            existingIR.items
          );
        }
      }

      // ------------------------------------------------------
      // NOTE / BULLET ITEMS
      // ------------------------------------------------------

      if (
        changes.items &&
        existingIR.kind === "note"
      ) {
        existingIR.items =
          applyBulletChanges(
            existingIR.items,
            changes.items
          );

        rebuildNativeNoteLabel(
          native,
          existingIR.title,
          existingIR.items
        );
      }

      // ------------------------------------------------------
      // POSITION
      // ------------------------------------------------------

      if (
        changes.position
      ) {
        applyNativePositionChange(
          native,
          changes.position
        );

        existingIR.position = {
          ...(existingIR.position || {}),
          ...changes.position
        };

        /*
         * Moving a node requires connected arrows to move.
         */
        for (
          const [
            arrowId,
            arrow
          ] of nativeMap.entries()
        ) {
          if (
            !isNativeArrow(arrow)
          ) {
            continue;
          }

          const from =
            getArrowEndpointId(
              arrow,
              "start"
            );

          const to =
            getArrowEndpointId(
              arrow,
              "end"
            );

          if (
            from === id ||
            to === id
          ) {
            arrowsToReroute.add(
              arrowId
            );
          }
        }

        /*
         * If a node belongs to a group, the group's bounds may
         * have to change.
         */
        for (
          const [
            groupId,
            groupIR
          ] of irMap.entries()
        ) {
          if (
            groupIR.kind === "group" &&
            Array.isArray(
              groupIR.children
            ) &&
            groupIR.children.includes(id)
          ) {
            groupsToRecompute.add(
              groupId
            );
          }
        }
      }

      // ------------------------------------------------------
      // SIZE
      // ------------------------------------------------------

      if (
        changes.size
      ) {
        applyNativeSizeChange(
          native,
          changes.size
        );

        existingIR.size = {
          ...(existingIR.size || {}),
          ...changes.size
        };

        for (
          const [
            arrowId,
            arrow
          ] of nativeMap.entries()
        ) {
          if (
            !isNativeArrow(arrow)
          ) {
            continue;
          }

          const from =
            getArrowEndpointId(
              arrow,
              "start"
            );

          const to =
            getArrowEndpointId(
              arrow,
              "end"
            );

          if (
            from === id ||
            to === id
          ) {
            arrowsToReroute.add(
              arrowId
            );
          }
        }

        for (
          const [
            groupId,
            groupIR
          ] of irMap.entries()
        ) {
          if (
            groupIR.kind === "group" &&
            Array.isArray(
              groupIR.children
            ) &&
            groupIR.children.includes(id)
          ) {
            groupsToRecompute.add(
              groupId
            );
          }
        }
      }

      // ------------------------------------------------------
      // STYLE
      // ------------------------------------------------------

      if (
        changes.style
      ) {
        applyNativeStyleChange(
          native,
          changes.style
        );

        existingIR.style = {
          ...(existingIR.style || {}),
          ...changes.style
        };
      }

      // ------------------------------------------------------
      // ROLE
      // ------------------------------------------------------

      if (
        changes.role !== undefined
      ) {
        const role =
          sanitizeRole(
            changes.role
          );

        if (role) {
          existingIR.role =
            role;

          /*
           * Preserve semantic metadata on the native element.
           */
          native.role =
            role;
        }
      }

      // ------------------------------------------------------
      // LAYER
      // ------------------------------------------------------

      if (
        changes.layer !== undefined
      ) {
        const layer =
          sanitizeLayer(
            changes.layer
          );

        if (layer) {
          existingIR.layer =
            layer;

          native.layer =
            layer;
        }
      }

      // ------------------------------------------------------
      // GROUP MEMBERSHIP
      // ------------------------------------------------------

      if (
        changes.group !== undefined
      ) {
        const groupId =
          cleanId(
            changes.group
          );

        if (groupId) {
          existingIR.group =
            groupId;

          native.group =
            groupId;
        } else {
          delete existingIR.group;
          delete native.group;
        }
      }

      // ------------------------------------------------------
      // GROUP CHILDREN
      // ------------------------------------------------------

      if (
        changes.children &&
        existingIR.kind === "group"
      ) {
        if (
          Array.isArray(
            changes.children
          )
        ) {
          existingIR.children =
            changes.children
              .map(cleanId)
              .filter(Boolean);

          native.children = [
            ...existingIR.children
          ];

          groupsToRecompute.add(
            id
          );
        }
      }

      // ------------------------------------------------------
      // RELATIONSHIP SOURCE
      // ------------------------------------------------------

      if (
        changes.from !== undefined &&
        existingIR.kind === "relationship"
      ) {
        const fromId =
          cleanId(
            changes.from
          );

        if (fromId) {
          existingIR.from =
            fromId;

          native.startBinding = {
            elementId: fromId
          };

          arrowsToReroute.add(
            id
          );
        }
      }

      // ------------------------------------------------------
      // RELATIONSHIP TARGET
      // ------------------------------------------------------

      if (
        changes.to !== undefined &&
        existingIR.kind === "relationship"
      ) {
        const toId =
          cleanId(
            changes.to
          );

        if (toId) {
          existingIR.to =
            toId;

          native.endBinding = {
            elementId: toId
          };

          arrowsToReroute.add(
            id
          );
        }
      }

      // ------------------------------------------------------
      // RELATIONSHIP TYPE
      // ------------------------------------------------------

      if (
        changes.relationshipType !== undefined &&
        existingIR.kind === "relationship"
      ) {
        const relationshipType =
          sanitizeRelationshipType(
            changes.relationshipType
          );

        if (
          relationshipType
        ) {
          existingIR.relationshipType =
            relationshipType;

          native.relationshipType =
            relationshipType;
        }
      }

      /*
       * Relationship label should be updated without replacing
       * the entire arrow element.
       */
      if (
        changes.label !== undefined &&
        existingIR.kind === "relationship"
      ) {
        const label =
          cleanText(
            changes.label,
            100
          );

        if (label) {
          native.label = {
            text: label
          };

          existingIR.label =
            label;
        } else {
          delete native.label;
          existingIR.label = "";
        }
      }
    }
  }

  // ==========================================================
  // CLEANUP ORPHANED RELATIONSHIPS
  // ==========================================================

  for (
    const [
      id,
      native
    ] of nativeMap.entries()
  ) {
    if (
      !isNativeArrow(native)
    ) {
      continue;
    }

    const fromId =
      getArrowEndpointId(
        native,
        "start"
      );

    const toId =
      getArrowEndpointId(
        native,
        "end"
      );

    if (
      !fromId ||
      !toId ||
      !nativeMap.has(fromId) ||
      !nativeMap.has(toId)
    ) {
      nativeMap.delete(id);
      continue;
    }
  }

  // ==========================================================
  // REROUTE AFFECTED ARROWS
  // ==========================================================

  for (
    const arrowId
    of arrowsToReroute
  ) {
    const arrow =
      nativeMap.get(
        arrowId
      );

    if (
      !arrow
    ) {
      continue;
    }

    rerouteNativeArrow(
      arrow,
      nativeMap
    );
  }

  if (arrowsToReroute.size > 0) {
    rerouteAllArrows(nativeMap);
  }

  // ==========================================================
  // RECOMPUTE GROUPS
  // ==========================================================

  for (
    const groupId
    of groupsToRecompute
  ) {
    recomputeNativeGroupBounds(
      groupId,
      nativeMap,
      irMap
    );
  }

  /*
   * Preserve the original scene ordering as much as possible,
   * while placing newly added groups before their children.
   */
  return orderNativeElements(
    nativeMap,
    existingElements
  );
}

// ============================================================
// IR SANITIZATION FOR ADD OPERATIONS
// ============================================================

function sanitizeIRForAdd(raw) {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return null;
  }

  const id =
    cleanId(raw.id);

  if (!id) {
    return null;
  }

  const kind =
    typeof raw.kind === "string"
      ? raw.kind
      : null;

  if (
    !kind ||
    !ALLOWED_KINDS.has(kind)
  ) {
    return null;
  }

  // ----------------------------------------------------------
  // NODE
  // ----------------------------------------------------------

  if (kind === "node") {
    const type =
      sanitizeNodeType(
        raw.type
      );

    const position =
      normalizePosition(
        raw.position
      );

    const size =
      normalizeSize(
        raw.size,
        {
          fallbackWidth:
            raw.role === "hero"
              ? 240
              : raw.role === "primary"
                ? 190
                : 150,

          fallbackHeight:
            raw.role === "hero"
              ? 110
              : raw.role === "primary"
                ? 85
                : 65,

          minWidth: 80,
          minHeight: 40
        }
      );

    const label =
      cleanText(
        raw.label,
        MAX_LABEL_LENGTH
      );

    if (!label) {
      return null;
    }

    const node = {
      id,
      kind: "node",
      type,
      label,
      position,
      size
    };

    const role =
      sanitizeRole(
        raw.role
      );

    const layer =
      sanitizeLayer(
        raw.layer
      );

    const visual = resolveVisualStyle(raw);

    const group =
      cleanId(
        raw.group
      );

    if (role) {
      node.role = role;
    }

    if (layer) {
      node.layer = layer;
    }

    node.style = { visual };

    if (group) {
      node.group = group;
    }

    return node;
  }

  // ----------------------------------------------------------
  // NOTE
  // ----------------------------------------------------------

  if (kind === "note") {
    const position =
      normalizePosition(
        raw.position
      );

    const size =
      normalizeSize(
        raw.size,
        {
          fallbackWidth: 280,
          fallbackHeight: 180,
          minWidth: 100,
          minHeight: 60
        }
      );

    const title =
      cleanText(
        raw.title,
        200
      ) || "Notes";

    const items =
      Array.isArray(raw.items)
        ? raw.items
            .map((item) =>
              cleanText(item, 500)
            )
            .filter(Boolean)
        : [];

    const note = {
      id,
      kind: "note",
      title,
      items,
      position,
      size
    };

    const role =
      sanitizeRole(
        raw.role
      );

    const layer =
      sanitizeLayer(
        raw.layer
      );

    const visual =
      sanitizeVisualStyle(
        raw.style?.visual
      );

    if (role) {
      note.role = role;
    }

    if (layer) {
      note.layer = layer;
    }

    note.style = { visual };

    return note;
  }

  // ----------------------------------------------------------
  // TEXT
  // ----------------------------------------------------------

  if (kind === "text") {
    const text =
      cleanText(
        raw.text,
        MAX_TEXT_LENGTH
      );

    if (!text) {
      return null;
    }

    const position =
      normalizePosition(
        raw.position
      );

    const fontSize =
      isFiniteNumber(
        raw.style?.fontSize
      )
        ? Math.max(
            12,
            Math.min(
              Math.round(
                raw.style.fontSize
              ),
              36
            )
          )
        : 20;

    return {
      id,
      kind: "text",
      text,
      position,
      style: {
        fontSize
      }
    };
  }

  // ----------------------------------------------------------
  // RELATIONSHIP
  // ----------------------------------------------------------

  if (kind === "relationship") {
    // "arrow" is the only relationship type this system supports — a
    // missing/omitted "type" field is redundant info the model sometimes
    // drops. Only reject if it's explicitly set to something else.
    if (
      raw.type !== undefined &&
      raw.type !== null &&
      raw.type !== "arrow"
    ) {
      console.warn("Rejected relationship add: unexpected type field.", {
        id: raw.id,
        type: raw.type,
      });
      return null;
    }

    const from =
      cleanId(
        raw.from
      );

    const to =
      cleanId(
        raw.to
      );

    if (
      !from ||
      !to ||
      from === to
    ) {
      console.warn("Rejected relationship add: invalid from/to.", {
        id: raw.id,
        from: raw.from,
        to: raw.to,
      });
      return null;
    }

    const relationship = {
      id,
      kind: "relationship",
      type: "arrow",
      from,
      to
    };

    const relationshipType =
      sanitizeRelationshipType(
        raw.relationshipType
      );

    const label =
      cleanText(
        raw.label,
        100
      );

    if (relationshipType) {
      relationship.relationshipType =
        relationshipType;
    }

    if (label) {
      relationship.label =
        label;
    }

    return relationship;
  }

  // ----------------------------------------------------------
  // GROUP
  // ----------------------------------------------------------

  if (kind === "group") {
    const children =
      Array.isArray(raw.children)
        ? raw.children
            .map(cleanId)
            .filter(Boolean)
        : [];

    const label =
      cleanText(
        raw.label,
        200
      ) || "";

    const group = {
      id,
      kind: "group",
      label,
      children
    };

    if (raw.position) {
      group.position =
        normalizePosition(
          raw.position
        );
    }

    if (raw.size) {
      group.size =
        normalizeSize(
          raw.size,
          {
            fallbackWidth: 300,
            fallbackHeight: 180,
            minWidth: 100,
            minHeight: 80
          }
        );
    }

    group.style = {
      visual: "group"
    };

    return group;
  }

  return null;
}


// ============================================================
// GROUP BOUNDING BOX
// ============================================================

function recomputeNativeGroupBounds(
  groupId,
  nativeMap,
  irMap
) {
  const groupNative =
    nativeMap.get(groupId);

  const groupIR =
    irMap.get(groupId);

  if (
    !groupNative ||
    !groupIR ||
    groupIR.kind !== "group" ||
    !Array.isArray(groupIR.children)
  ) {
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (
    const childId
    of groupIR.children
  ) {
    const child =
      nativeMap.get(childId);

    if (
      !child ||
      typeof child.x !== "number" ||
      typeof child.y !== "number" ||
      typeof child.width !== "number" ||
      typeof child.height !== "number"
    ) {
      continue;
    }

    minX =
      Math.min(
        minX,
        child.x
      );

    minY =
      Math.min(
        minY,
        child.y
      );

    maxX =
      Math.max(
        maxX,
        child.x + child.width
      );

    maxY =
      Math.max(
        maxY,
        child.y + child.height
      );
  }

  /*
   * A group with no valid children should not be destroyed.
   * Keep its existing geometry.
   */
  if (
    minX === Infinity ||
    minY === Infinity ||
    maxX === -Infinity ||
    maxY === -Infinity
  ) {
    return;
  }

  const padding = 40;

  groupNative.x =
    Math.max(
      0,
      minX - padding
    );

  groupNative.y =
    Math.max(
      0,
      minY - padding
    );

  groupNative.width =
    Math.min(
      MAX_BLOCK_WIDTH,
      Math.max(
        100,
        (maxX - minX) +
          padding * 2
      )
    );

  groupNative.height =
    Math.min(
      MAX_BLOCK_HEIGHT,
      Math.max(
        80,
        (maxY - minY) +
          padding * 2
      )
    );

  groupNative.semanticKind =
    "group";
}


// ============================================================
// NATIVE ELEMENT ORDERING
// ============================================================

/*
 * Preserve the existing order whenever possible.
 *
 * Newly added elements are appended.
 *
 * Groups are then moved before their children so that their
 * visual container stays behind the contained nodes.
 */
function orderNativeElements(
  nativeMap,
  existingElements
) {
  const originalIds =
    Array.isArray(existingElements)
      ? existingElements
          .map((element) =>
            typeof element?.id === "string"
              ? element.id
              : null
          )
          .filter(Boolean)
      : [];

  const ordered = [];
  const seen = new Set();

  /*
   * Existing elements retain their existing order.
   */
  for (
    const id
    of originalIds
  ) {
    if (
      nativeMap.has(id) &&
      !seen.has(id)
    ) {
      ordered.push(
        nativeMap.get(id)
      );

      seen.add(id);
    }
  }

  /*
   * Newly added elements are appended.
   */
  for (
    const [
      id,
      element
    ] of nativeMap.entries()
  ) {
    if (
      !seen.has(id)
    ) {
      ordered.push(element);
      seen.add(id);
    }
  }

  /*
   * Bring group containers before their children.
   *
   * This is intentionally conservative. We only reorder an
   * element when it is explicitly marked as a semantic group.
   */
  const groups =
    ordered.filter(
      (element) =>
        element?.semanticKind ===
        "group"
    );

  if (
    groups.length === 0
  ) {
    return ordered;
  }

  const nonGroups =
    ordered.filter(
      (element) =>
        element?.semanticKind !==
        "group"
    );

  return [
    ...groups,
    ...nonGroups
  ];
}


// ============================================================
// SCENE VALIDATION
// ============================================================

function validateOperationIds(
  operations
) {
  if (
    !Array.isArray(operations)
  ) {
    return [];
  }

  const seenAdds =
    new Set();

  const safe = [];

  for (
    const operation
    of operations.slice(
      0,
      MAX_OPERATIONS
    )
  ) {
    if (
      !operation ||
      typeof operation !== "object"
    ) {
      continue;
    }

    const op =
      operation.op;

    if (
      op !== "add" &&
      op !== "update" &&
      op !== "delete"
    ) {
      continue;
    }

    if (
      op === "add"
    ) {
      const element =
        sanitizeIRForAdd(
          operation.element
        );

      if (!element) {
        continue;
      }

      if (
        seenAdds.has(
          element.id
        )
      ) {
        continue;
      }

      seenAdds.add(
        element.id
      );

      safe.push({
        op: "add",
        element
      });

      continue;
    }

    const id =
      cleanId(
        operation.id
      );

    if (!id) {
      continue;
    }

    if (
      op === "delete"
    ) {
      safe.push({
        op: "delete",
        id
      });

      continue;
    }

    /*
     * Update operations need a sanitized changes object.
     */
    const changes =
      sanitizeUpdateChanges(
        operation.changes
      );

    if (
      !changes
    ) {
      continue;
    }

    safe.push({
      op: "update",
      id,
      changes
    });
  }

  return safe;
}


// ============================================================
// UPDATE CHANGES VALIDATION
// ============================================================

function sanitizeUpdateChanges(
  rawChanges
) {
  if (
    !rawChanges ||
    typeof rawChanges !== "object"
  ) {
    return null;
  }

  const changes = {};

  // ----------------------------------------------------------
  // label
  // ----------------------------------------------------------

  if (
    rawChanges.label !== undefined
  ) {
    const label =
      cleanText(
        rawChanges.label,
        MAX_LABEL_LENGTH
      );

    if (label) {
      changes.label = label;
    }
  }

  // ----------------------------------------------------------
  // text
  // ----------------------------------------------------------

  if (
    rawChanges.text !== undefined
  ) {
    const text =
      cleanText(
        rawChanges.text,
        MAX_TEXT_LENGTH
      );

    if (text) {
      changes.text = text;
    }
  }

  // ----------------------------------------------------------
  // title
  // ----------------------------------------------------------

  if (
    rawChanges.title !== undefined
  ) {
    const title =
      cleanText(
        rawChanges.title,
        200
      );

    if (title) {
      changes.title = title;
    }
  }

  // ----------------------------------------------------------
  // position
  // ----------------------------------------------------------

  if (
    rawChanges.position &&
    typeof rawChanges.position === "object"
  ) {
    const position = {};

    if (
      isFiniteNumber(
        rawChanges.position.x
      )
    ) {
      position.x =
        clampX(
          rawChanges.position.x
        );
    }

    if (
      isFiniteNumber(
        rawChanges.position.y
      )
    ) {
      position.y =
        clampY(
          rawChanges.position.y
        );
    }

    if (
      Object.keys(position).length > 0
    ) {
      changes.position =
        position;
    }
  }

  // ----------------------------------------------------------
  // size
  // ----------------------------------------------------------

  if (
    rawChanges.size &&
    typeof rawChanges.size === "object"
  ) {
    const size = {};

    if (
      isFiniteNumber(
        rawChanges.size.width
      )
    ) {
      size.width =
        clampWidth(
          rawChanges.size.width
        );
    }

    if (
      isFiniteNumber(
        rawChanges.size.height
      )
    ) {
      size.height =
        clampHeight(
          rawChanges.size.height
        );
    }

    if (
      Object.keys(size).length > 0
    ) {
      changes.size =
        size;
    }
  }

  // ----------------------------------------------------------
  // style
  // ----------------------------------------------------------

  if (
    rawChanges.style &&
    typeof rawChanges.style === "object"
  ) {
    const style = {};

    const visual =
      sanitizeVisualStyle(
        rawChanges.style.visual
      );

    if (visual) {
      style.visual =
        visual;
    }

    if (
      Object.keys(style).length > 0
    ) {
      changes.style =
        style;
    }
  }

  // ----------------------------------------------------------
  // role
  // ----------------------------------------------------------

  if (
    rawChanges.role !== undefined
  ) {
    const role =
      sanitizeRole(
        rawChanges.role
      );

    if (role) {
      changes.role =
        role;
    }
  }

  // ----------------------------------------------------------
  // layer
  // ----------------------------------------------------------

  if (
    rawChanges.layer !== undefined
  ) {
    const layer =
      sanitizeLayer(
        rawChanges.layer
      );

    if (layer) {
      changes.layer =
        layer;
    }
  }

  // ----------------------------------------------------------
  // group
  // ----------------------------------------------------------

  if (
    rawChanges.group !== undefined
  ) {
    const group =
      cleanId(
        rawChanges.group
      );

    /*
     * null / empty string means remove group membership.
     */
    changes.group =
      group || null;
  }

  // ----------------------------------------------------------
  // children
  // ----------------------------------------------------------

  if (
    Array.isArray(
      rawChanges.children
    )
  ) {
    changes.children =
      rawChanges.children
        .map(cleanId)
        .filter(Boolean);
  }

  // ----------------------------------------------------------
  // relationship: from
  // ----------------------------------------------------------

  if (
    rawChanges.from !== undefined
  ) {
    const from =
      cleanId(
        rawChanges.from
      );

    if (from) {
      changes.from =
        from;
    }
  }

  // ----------------------------------------------------------
  // relationship: to
  // ----------------------------------------------------------

  if (
    rawChanges.to !== undefined
  ) {
    const to =
      cleanId(
        rawChanges.to
      );

    if (to) {
      changes.to =
        to;
    }
  }

  // ----------------------------------------------------------
  // relationshipType
  // ----------------------------------------------------------

  if (
    rawChanges.relationshipType !== undefined
  ) {
    const relationshipType =
      sanitizeRelationshipType(
        rawChanges.relationshipType
      );

    if (relationshipType) {
      changes.relationshipType =
        relationshipType;
    }
  }

  // ----------------------------------------------------------
  // bullet items
  // ----------------------------------------------------------

  if (
    rawChanges.items &&
    typeof rawChanges.items === "object"
  ) {
    const items = {};

    if (
      typeof rawChanges.items.append === "string"
    ) {
      const value =
        cleanText(
          rawChanges.items.append,
          500
        );

      if (value) {
        items.append =
          value;
      }
    }

    if (
      rawChanges.items.insertAt &&
      typeof rawChanges.items.insertAt === "object"
    ) {
      const index =
        Number(
          rawChanges.items.insertAt.index
        );

      const value =
        cleanText(
          rawChanges.items.insertAt.value,
          500
        );

      if (
        Number.isInteger(index) &&
        index >= 0 &&
        value
      ) {
        items.insertAt = {
          index,
          value
        };
      }
    }

    if (
      rawChanges.items.updateAt &&
      typeof rawChanges.items.updateAt === "object"
    ) {
      const index =
        Number(
          rawChanges.items.updateAt.index
        );

      const value =
        cleanText(
          rawChanges.items.updateAt.value,
          500
        );

      if (
        Number.isInteger(index) &&
        index >= 0 &&
        value
      ) {
        items.updateAt = {
          index,
          value
        };
      }
    }

    if (
      typeof rawChanges.items.removeAt === "number"
    ) {
      const index =
        Math.trunc(
          rawChanges.items.removeAt
        );

      if (
        index >= 0
      ) {
        items.removeAt =
          index;
      }
    }

    if (
      Array.isArray(
        rawChanges.items.replace
      )
    ) {
      items.replace =
        rawChanges.items.replace
          .map((item) =>
            cleanText(
              item,
              500
            )
          )
          .filter(Boolean);
    }

    if (
      Object.keys(items).length > 0
    ) {
      changes.items =
        items;
    }
  }

  return Object.keys(changes).length > 0
    ? changes
    : null;
}


// ============================================================
// EXISTING-CANVAS SAFETY VALIDATION
// ============================================================

function filterOperationsAgainstScene(
  operations,
  existingElements
) {
  const existingIds = new Set();
  const endpointIds = new Set();

  for (const element of Array.isArray(existingElements) ? existingElements : []) {
    if (typeof element?.id !== "string") {
      continue;
    }

    existingIds.add(element.id);

    // Text can't be a relationship endpoint — rerouteNativeArrow only
    // computes real geometry for rectangle/ellipse/diamond blocks. A
    // relationship pointed at text would pass every other check and then
    // silently render as an invisible stub arrow at (0,0).
    if (!isNativeArrow(element) && !isNativeText(element)) {
      endpointIds.add(element.id);
    }
  }

  for (const operation of Array.isArray(operations) ? operations : []) {
    if (
      operation?.op === "add" &&
      operation.element?.kind !== "relationship" &&
      operation.element?.kind !== "text" &&
      typeof operation.element?.id === "string"
    ) {
      endpointIds.add(operation.element.id);
    }
  }

  const addedIds =
    new Set();

  const result = [];

  for (
    const operation
    of operations
  ) {
    if (
      !operation ||
      typeof operation !== "object"
    ) {
      continue;
    }

    if (
      operation.op === "add"
    ) {
      const id =
        operation.element?.id;

      if (
        typeof id !== "string" ||
        existingIds.has(id) ||
        addedIds.has(id)
      ) {
        /*
         * "add" must never overwrite an existing element.
         */
        continue;
      }

      if (
        operation.element?.kind === "relationship" &&
        (!endpointIds.has(operation.element.from) ||
          !endpointIds.has(operation.element.to) ||
          operation.element.from === operation.element.to)
      ) {
        console.warn("Dropped relationship: endpoint not found in scene.", {
          id: operation.element.id,
          from: operation.element.from,
          to: operation.element.to,
          fromExists: endpointIds.has(operation.element.from),
          toExists: endpointIds.has(operation.element.to),
        });
        continue;
      }

      addedIds.add(id);

      if (
        operation.element?.kind !== "relationship" &&
        operation.element?.kind !== "text"
      ) {
        endpointIds.add(id);
      }

      result.push(
        operation
      );

      continue;
    }

    if (
      operation.op === "update"
    ) {
      const id =
        operation.id;

      /*
       * Update may target an existing element OR an element
       * added earlier in the same operation batch.
       */
      if (
        !existingIds.has(id) &&
        !addedIds.has(id)
      ) {
        continue;
      }

      if (
        operation.changes &&
        (operation.changes.from !== undefined ||
          operation.changes.to !== undefined) &&
        ((operation.changes.from !== undefined &&
          !endpointIds.has(operation.changes.from)) ||
          (operation.changes.to !== undefined &&
            !endpointIds.has(operation.changes.to)) ||
          (operation.changes.from !== undefined &&
            operation.changes.to !== undefined &&
            operation.changes.from === operation.changes.to))
      ) {
        continue;
      }

      result.push(
        operation
      );

      continue;
    }

    if (
      operation.op === "delete"
    ) {
      const id =
        operation.id;

      /*
       * Deleting something that does not exist is harmless, but
       * ignoring it makes the operation semantics predictable.
       */
      if (
        !existingIds.has(id) &&
        !addedIds.has(id)
      ) {
        continue;
      }

      result.push(
        operation
      );
    }
  }

  return result;
}

function finalizeCreatedScene(elements) {
  const nativeElements = Array.isArray(elements)
    ? elements.map((element) => ({ ...element }))
    : [];
  const nativeMap = new Map(
    nativeElements
      .filter((element) => typeof element?.id === "string")
      .map((element) => [element.id, element])
  );
  const irMap = new Map(
    convertNativeElementsToIR(nativeElements)
      .map((element) => [element.id, element])
  );

  for (const [id, native] of nativeMap) {
    if (isNativeArrow(native)) {
      const from = getArrowEndpointId(native, "start");
      const to = getArrowEndpointId(native, "end");

      if (
        !from ||
        !to ||
        from === to ||
        !nativeMap.has(from) ||
        !nativeMap.has(to) ||
        isNativeArrow(nativeMap.get(from)) ||
        isNativeArrow(nativeMap.get(to))
      ) {
        nativeMap.delete(id);
      }

      continue;
    }

    const ir = irMap.get(id);

    if (
      !ir ||
      (ir.kind !== "node" &&
        ir.kind !== "note" &&
        ir.kind !== "group")
    ) {
      continue;
    }

    const visual = resolveVisualStyle(ir);

    Object.assign(native, getExcalidrawStyle(visual));
    native.visualStyle = visual;

    if (ir?.kind === "node") {
      native.semanticKind = "node";
    } else if (ir?.kind === "note") {
      native.semanticKind = "note";
    } else if (ir?.kind === "group") {
      native.semanticKind = "group";
    }
  }

  // ----------------------------------------------------------
  // NOTE HEIGHT AUTO-CALCULATION & OVERLAP PREVENTION
  // ----------------------------------------------------------
  const noteElements = Array.from(nativeMap.values()).filter((el) => el?.semanticKind === "note");

  // A. Ensure each note card height fits its bullet contents
  for (const note of noteElements) {
    const text = note.label?.text || "";
    const lines = text.split("\n");
    const approxCharsPerLine = Math.max(25, Math.floor((note.width - 36) / 9.5));
    let visualLineCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        visualLineCount += 0.5;
      } else {
        visualLineCount += Math.max(1, Math.ceil(trimmed.length / approxCharsPerLine));
      }
    }
    const requiredHeight = Math.max(180, Math.round(visualLineCount * 22 + 45));
    if (note.height < requiredHeight) {
      note.height = requiredHeight;
    }
  }

  // B. Group notes into columns by X position and sort by Y to prevent vertical overlaps
  const noteColumns = new Map();
  for (const note of noteElements) {
    const colKey = Math.round(note.x / 100) * 100;
    if (!noteColumns.has(colKey)) noteColumns.set(colKey, []);
    noteColumns.get(colKey).push(note);
  }

  for (const colNotes of noteColumns.values()) {
    colNotes.sort((a, b) => a.y - b.y);
    for (let i = 1; i < colNotes.length; i++) {
      const prev = colNotes[i - 1];
      const curr = colNotes[i];
      const minSafeY = prev.y + prev.height + 36;
      if (curr.y < minSafeY) {
        curr.y = minSafeY;
      }
    }
  }

  rerouteAllArrows(nativeMap);

  return orderNativeElements(nativeMap, nativeElements);
}

async function repairCreationRelationships(elements, topic, requestId) {
  const createdIR = convertNativeElementsToIR(elements);
  const nodes = createdIR
  .filter((element) => element.kind === "node")
  .map((element) => ({
    id: element.id,
    label: element.label,
    type: element.type,
    x: element.position?.x,
    y: element.position?.y,
    width: element.size?.width,
    height: element.size?.height
  }));
  const relationships = createdIR.filter(
    (element) => element.kind === "relationship"
  );

  const needsRepair =
    nodes.length >= 2 &&
    relationships.length === 0;

  if (!needsRepair) {
    return elements;
  }

  try {
    const repairPrompt = [
      ARROW_ONLY_INSTRUCTIONS,
      "Requested topic:",
      topic,
      "Existing nodes:",
      JSON.stringify(nodes),
      "Only use the exact node IDs provided above."
    ].join("\n\n");
    const repairText = await callModel(repairPrompt, 2000);
    let repairOperations = validateOperationIds(
      extractOperations(repairText)
    );

    repairOperations = filterOperationsAgainstScene(
      repairOperations,
      elements
    );

    const repaired = applyOperationsToCanvas(elements, repairOperations);
    console.info("Creation connection repair completed.", {
      requestId,
      repairOperationCount: repairOperations.length
    });
    return repaired;
  } catch (repairError) {
    console.error("Connection repair failed.", {
      requestId,
      message: repairError.message
    });
    return elements;
  }
}


// ============================================================
// OPENAI CLIENT
// ============================================================

const endpoint =
  process.env.AZURE_OPENAI_ENDPOINT;

const deploymentName =
  process.env.AZURE_OPENAI_DEPLOYMENT;

const apiKey =
  process.env.AZURE_OPENAI_API_KEY;

if (
  endpoint &&
  !endpoint.includes("/openai/v1")
) {
  console.warn(
    "AZURE_OPENAI_ENDPOINT does not contain '/openai/v1'. " +
    "Use the exact base URL from the Azure AI Foundry sample."
  );
}

const openai =
  new OpenAI({
    baseURL: endpoint || "https://example.com/openai/v1",
    apiKey: apiKey || "unconfigured-key"
  });


async function callModel(
  promptText,
  maxOutputTokens
) {
  const response =
    await openai.responses.create({
      model: deploymentName,
      input: promptText,
      max_output_tokens:
        maxOutputTokens,

      text: {
        format: {
          type: "json_object"
        }
      }
    });

  if (
    response.status === "incomplete"
  ) {
    throw new Error(
      `The model didn't finish generating: ${
        response.incomplete_details?.reason ||
        "unknown reason"
      }`
    );
  }

  const text =
    response.output_text || "";

  if (!text) {
    throw new Error(
      "The model returned no visible text."
    );
  }

  return text;
}


// ============================================================
// AZURE FUNCTION
// ============================================================

app.http(
  "generate",
  {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "generate",

    handler: async (
      request
    ) => {
      const requestId =
        randomUUID();

      const startedAt =
        Date.now();

      try {
        // ----------------------------------------------------
        // Configuration validation
        // ----------------------------------------------------

        if (
          !apiKey ||
          !endpoint ||
          !deploymentName
        ) {
          console.error(
            "Missing Azure OpenAI configuration.",
            {
              requestId,
              hasKey: !!apiKey,
              hasEndpoint: !!endpoint,
              hasDeployment:
                !!deploymentName
            }
          );

          return {
            status: 500,

            jsonBody: {
              error:
                "AI generation is not configured yet."
            }
          };
        }

        // ----------------------------------------------------
        // Request body
        // ----------------------------------------------------

        const body =
          await request.json();

        const topic =
          String(
            body?.topic || ""
          ).trim();

        const existingElements =
          Array.isArray(
            body?.existingElements
          )
            ? body.existingElements
            : [];

        if (!topic) {
          return {
            status: 400,

            jsonBody: {
              error:
                "Topic is required."
            }
          };
        }

        if (
          topic.length > 180
        ) {
          return {
            status: 400,

            jsonBody: {
              error:
                "Topic must be 180 characters or fewer."
            }
          };
        }

        const isEdit =
          existingElements.length >
          0;

        console.info(
          "Generate request started.",
          {
            requestId,
            model:
              deploymentName,
            mode:
              isEdit
                ? "edit"
                : "create",
            topicLength:
              topic.length,
            existingCount:
              existingElements.length
          }
        );

        // ----------------------------------------------------
        // EDIT MODE
        // ----------------------------------------------------

        if (isEdit) {
          /*
           * Convert only enough of the native canvas into semantic
           * information for the LLM.
           *
           * The original native elements remain untouched until
           * applyOperationsToCanvas() receives the model result.
           */
          const existingIR =
            convertNativeElementsToIR(
              existingElements
            );

          const promptParts = [
            EDIT_INSTRUCTIONS,

            "Current Scene (Canvas IR):",

            JSON.stringify(
              existingIR
            ),

            "User Instruction:",

            topic
          ];

          const generatedText =
            await callModel(
              promptParts.join(
                "\n\n"
              ),
              8000
            );

          let rawOperations =
            extractOperations(
              generatedText
            );

          rawOperations =
            validateOperationIds(
              rawOperations
            );

          rawOperations =
            filterOperationsAgainstScene(
              rawOperations,
              existingElements
            );

          console.info(
            "Edit operations received.",
            {
              requestId,
              operationCount:
                rawOperations.length
            }
          );

          /*
           * CRITICAL:
           *
           * This does NOT regenerate the whole scene.
           *
           * Only explicitly touched native elements are changed.
           */
          const finalElements =
            applyOperationsToCanvas(
              existingElements,
              rawOperations
            );

          console.info(
            "Edit completed.",
            {
              requestId,
              elementCount:
                finalElements.length,
              durationMs:
                Date.now() -
                startedAt
            }
          );

          return {
            status: 200,
            jsonBody:
              finalElements
          };
        }

        // ----------------------------------------------------
        // CREATE MODE
        // ----------------------------------------------------

        const promptParts = [
          CREATE_INSTRUCTIONS,

          "Requested topic:",

          topic
        ];

        const generatedText =
          await callModel(
            promptParts.join(
              "\n\n"
            ),
            8000
          );

        let operations =
          extractOperations(
            generatedText
          );

        operations =
          validateOperationIds(
            operations
          );

        operations =
          filterOperationsAgainstScene(
            operations,
            []
          );

        /*
         * Creation starts with an empty canvas.
         */
        let finalElements =
          applyOperationsToCanvas(
            [],
            operations
          );

        // Creation alone gets deterministic normalization and repair.
        finalElements = finalizeCreatedScene(finalElements);
        finalElements = await repairCreationRelationships(
          finalElements,
          topic,
          requestId
        );
        finalElements = finalizeCreatedScene(finalElements);

        console.info(
          "Creation completed.",
          {
            requestId,
            elementCount:
              finalElements.length,
            durationMs:
              Date.now() -
              startedAt
          }
        );

        return {
          status: 200,
          jsonBody:
            finalElements
        };
      } catch (error) {
        console.error(
          "Generate function error.",
          {
            requestId,
            message:
              error?.message ||
              String(error),

            stack:
              error?.stack,

            durationMs:
              Date.now() -
              startedAt
          }
        );

        return {
          status: 500,

          jsonBody: {
            error:
              "Unable to generate a diagram right now.",

            debug:
              error?.message ||
              String(error)
          }
        };
      }
    }
  }
);
module.exports = {
  CREATE_INSTRUCTIONS,
  ARROW_ONLY_INSTRUCTIONS,
  THEME_STYLES,
  LEGACY_THEME_STYLES,
  getExcalidrawStyle,
  resolveVisualStyle,
  detectVisualStyleFromNativeElement,
  edgePoint,
  buildArrowGeometry,
  rerouteAllArrows,
  rerouteNativeArrow,
  renderSingleIRNode,
  applyOperationsToCanvas,
  finalizeCreatedScene,
  parseModelJson,
  extractOperations,
  validateOperationIds,
  filterOperationsAgainstScene
};