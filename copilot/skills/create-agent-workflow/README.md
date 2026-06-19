# Create Agent Workflow skill

The [create-agent-workflow skill](./SKILL.md) helps an agent create file-based C# workflows that orchestrate one or more agents with durable JSON state. Use it for Ralph-style checklist workflows, builder&evaluator loops, and other multi-agent orchestration workflows.

A workflow app uses the bundled Agent Workflow Framework and a `state.json` checkpoint. It typically contains:

- serializable state types for `state.json`
- agent/prompt definitions derived from `AgentAction<TAgent, TInput>` or `AgentFunc<TAgent, TInput, TOutput>`
- a workflow method that reads state, invokes agents, and saves the next state

The skill includes some working examples as well as an API reference.

The framework also supports `--dry-run` for validation and `--single-step` to exit after the next saved state checkpoint.

Here's an example of prompt one might use (minus details about tools and evaluation criteria):

```
Create an agent workflow to convert the build in this repo to Bazel. We're going to do it project by project. 
For each project, we'll have an agent make the change, then an evaluator to check it was done well. The evaluator will use rubber-duck review and will verify bit-for-bit parity with tools we'll provide.
If a project fails to be ported after 3 rounds of porting & evaluating, then we should stop.
When the porter and evaluator agree, a project is considered done: create a commit to save the progress ("ported project <project name>") and the workflow should continue to the next project in our project checklist.
Populate the checklist with 3 projects from the repo initially.
Give me the command to run the resulting workflow tool step-by-step, so I can test it out on the first project.
```
