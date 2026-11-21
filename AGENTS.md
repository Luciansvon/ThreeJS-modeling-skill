# Working on ThreeJS Modeling Skill

- Use [the harness edition](threejs-asset-generator/SKILL.md) for local build, reference intake, QA, rig checks, budgets, and export. Keep its package self-contained and its existing skill name stable.
- Keep [the web edition](threejs-asset-generator-web/SKILL.md) usable as a single Markdown file in plain chat. Add alternatives that use chat output or optional hosted tools. Keep local setup, runtime packages, and GPU requirements out of that edition.
- Keep asset conventions aligned across both editions. When one edition changes units, axes, origin, or evidence labels, check the other edition for compatibility.
- Run the usage checks in [README.md](README.md). Record failed gates, skipped checks, and artifact or log evidence when reporting verification.
- Reuse B.I.M.A-DEV-INFRA for shared repository checks. Keep Three.js tests and asset criteria with this project.
