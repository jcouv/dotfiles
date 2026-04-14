Notes on my [VsVim configuration](https://github.com/jcouv/dotfiles/wiki/Notes-on-VsVim-keybindings)

## Copilot skills

Personal Copilot skills live under `copilot\skills\`.

To register this location with GitHub Copilot CLI:

```text
/skills add C:\repos\dotfiles\copilot\skills
```

After adding or editing a skill, reload them with:

```text
/skills reload
```

## Copilot instructions

Personal Copilot instructions live under `copilot\instructions\AGENTS.md`.

The shell profiles in this repo add `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` to include:

```text
C:\repos\dotfiles\copilot\instructions
```

If you want to confirm they loaded, use:

```text
/instructions
```

## Ralph runner

This repo also includes a single-file .NET runner for Ralph using GitHub Copilot CLI:

```text
dotnet run .\copilot\ralph.cs -- 10
```

It looks for these files in the current working directory:

- `prd.json`
- `prompt.md`

It also expects `copilot` to be installed and already authenticated locally.
